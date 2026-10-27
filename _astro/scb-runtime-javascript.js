var e;function t(t,{signal:n}){e??=URL.createObjectURL(new Blob([`
const stdout = [];
const stderr = [];
const format = (a) => {
  if (typeof a === 'string') return a;
  if (typeof a === 'bigint') return a + 'n';
  if (a instanceof Error) return String(a);
  if (a instanceof Map || a instanceof Set) return a.constructor.name + ' ' + format([...a]);
  try {
    return JSON.stringify(a) ?? String(a);
  } catch {
    return String(a);
  }
};
const text = (args) => args.map(format).join(' ');
console.log = console.info = (...args) => stdout.push(text(args));
console.error = console.warn = (...args) => stderr.push(text(args));
const done = () => postMessage({ stdout: stdout.join('\\n'), stderr: stderr.join('\\n') });
// Errors in timers and other callbacks escape the try/catch.
onerror = (message) => {
  stderr.push(String(message));
  done();
  return true;
};
onunhandledrejection = ({ reason }) => {
  stderr.push(String(reason));
  done();
};
onmessage = async ({ data: code }) => {
  try {
    const AsyncFunction = (async () => {}).constructor;
    await new AsyncFunction(code)();
  } catch (error) {
    stderr.push(String(error));
  }
  done();
};`],{type:`text/javascript`}));let r=new Worker(e);return new Promise((e,i)=>{n.addEventListener(`abort`,()=>{r.terminate(),i(n.reason)}),r.onmessage=({data:t})=>{r.terminate(),e(t)},r.postMessage(t)})}var n={async load(){},run:t};export{n as default,t as runJavaScript};