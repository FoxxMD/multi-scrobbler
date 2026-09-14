
type LineRange = [number, number]; // [startLine, endLine], both 1-indexed and inclusive

export async function extractSnippet(
  stream: ReadableStream<Uint8Array>,
  ranges: LineRange[]
): Promise<string[]> {
  if (ranges.length === 0) return [];

  const reader = stream.getReader();
  const decoder = new TextDecoder();

  // Keep track of each range's original position so output order matches input order,
  // regardless of the order lines actually arrive in.
  const indexed = ranges.map((range, originalIndex) => ({
    start: range[0],
    end: range[1],
    originalIndex,
  }));

  // Sort by start line so we can advance an "upcoming ranges" pointer in one pass.
  const sortedByStart = [...indexed].sort((a, b) => a.start - b.start);

  const results: string[] = new Array(ranges.length).fill('');
  const lineBuffers: string[][] = ranges.map(() => []);

  // Ranges currently "open" (currentLine is within [start, end])
  const active: typeof indexed = [];
  let nextToActivate = 0; // pointer into sortedByStart

  const maxEndLine = Math.max(...indexed.map(r => r.end));

  let currentLine = 1;
  let buffer = '';
  let done = false;

  const activateRangesForLine = (line: number) => {
    while (
      nextToActivate < sortedByStart.length &&
      sortedByStart[nextToActivate].start <= line
    ) {
      const r = sortedByStart[nextToActivate];
      if (r.end >= line) {
        active.push(r);
      }
      nextToActivate++;
    }
  };

  const processLine = (line: string) => {
    activateRangesForLine(currentLine);

    for (let i = active.length - 1; i >= 0; i--) {
      const r = active[i];
      if (currentLine >= r.start && currentLine <= r.end) {
        lineBuffers[r.originalIndex].push(line);
      }
      if (currentLine >= r.end) {
        // This range is done; finalize it and remove from active list
        results[r.originalIndex] = lineBuffers[r.originalIndex].join('\n');
        active.splice(i, 1);
      }
    }
  };

  while (!done) {
    if (currentLine > maxEndLine) {
      await reader.cancel();
      break;
    }

    const { value, done: streamDone } = await reader.read();
    if (streamDone) {
      done = true;
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      processLine(line);
      currentLine++;

      if (currentLine > maxEndLine) {
        await reader.cancel();
        done = true;
        break;
      }
    }
  }

  // Flush decoder for any trailing multi-byte sequence
  buffer += decoder.decode();

  // Handle final line if stream ended without a trailing newline
  if (buffer.length > 0 && currentLine <= maxEndLine) {
    processLine(buffer);
  }

  // Finalize any ranges that never got their `end` line closed out
  // (e.g. requested endLine beyond the actual content length)
  for (const r of active) {
    results[r.originalIndex] = lineBuffers[r.originalIndex].join('\n');
  }

  return results;
}