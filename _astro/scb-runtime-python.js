var e=`https://cdn.jsdelivr.net/pyodide/v314.0.7/full/`,t=`
let ready;
let interactive;
let missing;
let queue = Promise.resolve();
onmessage = ({ data }) => {
  queue = queue.then(() => handle(data));
};
const install = async (py, names) => {
  await py.loadPackage('micropip');
  await py.pyimport('micropip').install(names);
};
const handle = async ({ id, url, code, session, prepare, packages = [] }) => {
  try {
    ready ??= import(url + 'pyodide.mjs')
      .then((m) => m.loadPyodide({ indexURL: url }))
      .then((py) => {
        interactive = py.runPython(${JSON.stringify(`
import ast, traceback
def _scb_session(src, g):
    try:
        for node in ast.parse(src, '<stdin>').body:
            exec(compile(ast.Interactive([node]), '<stdin>', 'single'), g)
    except BaseException as e:
        tb = None if isinstance(e, SyntaxError) else e.__traceback__.tb_next
        traceback.print_exception(e.with_traceback(tb))
_scb_session
`)});
        missing = py.runPython(${JSON.stringify(`
import importlib.util, sys
from pyodide.code import find_imports
def _scb_missing(src):
    try:
        names = find_imports(src)
    except SyntaxError:
        return []
    return [n for n in names if n not in sys.stdlib_module_names and importlib.util.find_spec(n) is None]
_scb_missing
`)});
        return py;
      });
    const py = await ready;
    if (prepare !== undefined) {
      // A package that does not install shows up as an import error when the code runs.
      await py.loadPackagesFromImports(prepare).catch(() => {});
      if (packages.length > 0) {
        try {
          await install(py, packages);
        } catch (e) {
          return postMessage({ id, error: 'The packages did not install. ' + String(e?.message ?? e).trim().split('\\n').at(-1) });
        }
      }
      // Pure Python packages that Pyodide does not have come from PyPI, under their import name.
      const names = missing(prepare).toJs();
      if (names.length > 0) await install(py, names).catch(() => {});
      return postMessage({ id });
    }
    const decoder = new TextDecoder();
    let stdout = '';
    let stderr = '';
    py.setStdout({ write: (b) => ((stdout += decoder.decode(b, { stream: true })), b.length) });
    py.setStderr({ write: (b) => ((stderr += decoder.decode(b, { stream: true })), b.length) });
    const globals = py.globals.get('dict')();
    globals.set('__name__', '__main__');
    let failure;
    try {
      if (session) interactive(code, globals);
      else await py.runPythonAsync(code, { globals });
    } catch (e) {
      failure = e;
    } finally {
      // Text after the last newline stays in Python's buffers until they flush.
      py.runPython('import sys; sys.stdout.flush(); sys.stderr.flush()');
      globals.destroy();
    }
    // Drop Pyodide's own frames, so that the traceback starts at the reader's code.
    if (failure) stderr += String(failure.message).replace(/^(Traceback[^\\n]*\\n)[\\s\\S]*?(?=  File "<exec>")/, '$1');
    postMessage({ id, stdout: stdout.replace(/\\n$/, ''), stderr: stderr.trimEnd() });
  } catch (e) {
    ready = undefined;
    postMessage({ id, error: String(e?.message ?? e) });
  }
};`;function n({url:n=e}={}){let r,i=0,a=new Map,o=new Map;function s(){let e=URL.createObjectURL(new Blob([t],{type:`text/javascript`})),n=new Worker(e,{type:`module`});return n.onmessage=({data:e})=>{let t=o.get(e.id);o.delete(e.id),e.error===void 0?t?.resolve(e):t?.reject(Error(e.error))},n.onerror=e=>{c();for(let t of o.values())t.reject(Error(e.message||`The worker did not start.`));o.clear()},n}function c(){r?.terminate(),r=void 0}function l(e,t){r??=s(),r.postMessage({id:e,url:new URL(n,globalThis.location?.href).href,...t})}function u(e,t){let n=o.get(e);if(n){o.delete(e),c(),n.reject(t);for(let[e,{message:t}]of o)`code`in t&&l(i++,{prepare:t.code,packages:t.packages}),l(e,t)}}function d(e,t){return new Promise((n,r)=>{if(t?.aborted)return r(t.reason);let a=i++;t?.addEventListener(`abort`,()=>u(a,t.reason),{once:!0}),o.set(a,{message:e,resolve:n,reject:r}),l(a,e)})}return{load:async(e,{packages:t=[]}={})=>{a.set(e,t),await d({prepare:e,packages:t})},run:async(e,{signal:t,session:n=!1})=>{let{stdout:r=``,stderr:i=``}=await d({code:e,session:n,packages:a.get(e)??[]},t);return{stdout:r,stderr:i}}}}var r=n();export{e as PYODIDE_URL,r as default,n as pyodide};