import React from 'react';
import {
    createBrowserRouter,
    createHashRouter, RouteObject,
    RouterProvider, useLocation,
} from "react-router-dom";
import {connect, ConnectedProps, Provider} from 'react-redux'
import './App.css';
import CopyToClipboard from "./components/CopyToClipboard";
import ExternalLink from "./components/ExternalLink";
import {store} from './store';
import Dashboard from "./dashboard/dashboard";
import RecentPage from "./recent/RecentPage";
import ScrobbledPage from "./scrobbled/ScrobbledPage";
import DeadPage from "./deadLetter/DeadPage";
import {clientUpdate, sourceUpdate} from "./status/ducks";
import {useEventSource, useEventSourceListener} from "@react-nano/use-event-source";
import Version from "./Version";

function NoMatch() {
    const location = useLocation();

    return (
        <div>
                No page for <code>{location.pathname}</code> exists!
        </div>
    );
}

// https://tailwindflex.com/@sienna/copy-code-block
function MissingDocs() {
    return (
        <div>
            <div>Oops! You need to build docs first. Run the following commands to build:</div>
            <code
                className="mt-5 text-sm sm:text-base inline-flex text-left items-center space-x-4 bg-gray-900 text-white rounded-lg p-4 pl-6">
                    <span className="flex gap-4">
                        <span className="shrink-0 text-gray-500">
                            $
                        </span>

                        <span className="flex-1">
                            <span>
                                npm run  <span className="text-yellow-500">docs:install</span> && npm run <span
                                className="text-yellow-500">docs:build</span>
                            </span>
                        </span>
                    </span>

                <CopyToClipboard text="npm run docs:install && npm run docs:build"/>
            </code>
        </div>
    );
}

const routes: RouteObject[] = [
    {
        path: "/",
        element: <Dashboard/>,
    },
    {
        path: "/recent",
        element: <RecentPage/>,
    },
    {
        path: "/scrobbled",
        element: <ScrobbledPage/>,
    },
    {
        path: "/dead",
        element: <DeadPage/>,
    },
    {
        path: "/docs",
        element: <MissingDocs/>
    },
    {
        path: "*",
        element: <NoMatch/>
    }
];

const genRouter = () => {
    const useHashRouter = __USE_HASH_ROUTER__ === 'true';
    return useHashRouter ? createHashRouter(routes) : createBrowserRouter(routes);
}

const router = genRouter();

const mapDispatchToProps = (dispatch) => {
    return {
        updateSource: (payload) => dispatch(sourceUpdate(payload)),
        updateClient: (payload) => dispatch(clientUpdate(payload))
    }
}

const connector = connect(null, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;

const Global = (props: PropsFromRedux) => {
    const {
        updateSource,
        updateClient
    } = props;

    const [sourceEventSource, eventSourceStatus] = useEventSource("api/events", false);
    useEventSourceListener(sourceEventSource, ['source', 'client'], evt => {
        const data = JSON.parse(evt.data);
        if(data.from === 'source') {
            updateSource(data);
        } else if(data.from === 'client') {
            updateClient(data);
        }
    }, [updateSource, updateClient]);

    return <span/>;
}

const ConnectedGlobal = connector(Global);

function App() {
  return (
      <Provider store={store}>
      <div className="min-w-screen min-h-screen bg-gray-800 font-sans text-white">
        <div className="space-x-4 p-6 md:px-10 md:py-6 leading-6 font-semibold bg-gray-800 text-white">
          <div className="container mx-auto">
              <div className="flex items-center justify-between">
                  <a href="/" className="flex items-center no-underline pr-4">
                      <img src="/icon.svg" style={{maxWidth: '30px'}}/>
                      <span className="ml-2">Multi Scrobbler</span>
                  </a>
                  <Version/>
                  <span className="space-x-3" style={{marginLeft: 'auto'}}>
                       <a href="/docs">
                          Docs
                      </a>
                      <a target="_blank" href="https://github.com/FoxxMD/multi-scrobbler">
                          Github <ExternalLink/>
                      </a>
                  </span>
              </div>
          </div>
        </div>
          <div className="container mx-auto">
              <ConnectedGlobal/>
              <RouterProvider router={router}/>
          </div>
      </div>
      </Provider>
  );
}

export default App;
