import React from 'react';
import {
    createBrowserRouter,
    createHashRouter, RouteObject,
    RouterProvider, useLocation,
} from "react-router-dom";
import {connect, ConnectedProps, Provider as ReduxProvider} from 'react-redux'
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
import { MSComponentList, MSComponentListFetchable } from './components/msComponent/MSComponentList';
import { Provider } from './components/Provider';
import { Container } from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query'
import { ComponentsApiJson, ComponentSourceApiJson } from '../core/Api';

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
        path: "/next",
        element: <MSComponentListFetchable/>,
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

// const mapDispatchToProps = (dispatch) => {
//     return {
//         updateSource: (payload) => dispatch(sourceUpdate(payload)),
//         updateClient: (payload) => dispatch(clientUpdate(payload))
//     }
// }

// const connector = connect(null, mapDispatchToProps);

// type PropsFromRedux = ConnectedProps<typeof connector>;

// const Global = (props: PropsFromRedux) => {
//     const {
//         updateSource,
//         updateClient
//     } = props;

//     const [sourceEventSource, eventSourceStatus] = useEventSource("api/events", false);
//     useEventSourceListener(sourceEventSource, ['source', 'client'], evt => {
//         const data = JSON.parse(evt.data);
//         if(data.from === 'source') {
//             updateSource(data);
//         } else if(data.from === 'client') {
//             updateClient(data);
//         }
//     }, [updateSource, updateClient]);

//     return <span/>;
// }

// const ConnectedGlobal = connector(Global);

const Global = (props) => {

    const queryClient = useQueryClient();
    const [sourceEventSource, eventSourceStatus] = useEventSource("/api/events", false);
    useEventSourceListener(sourceEventSource, ['source', 'client'], evt => {
        const data = JSON.parse(evt.data);
        if(data.event === 'playerUpdate') {

            console.log(`Updated => Component ${data.componentId} Player ${data.data.platformId}`);
            queryClient.setQueryData(['components', data.componentId, 'players', data.data.platformId], data.data);

            // queryClient.setQueryData(['components'], (old: ComponentsApiJson[]) => {
            //     const componentIndex = old.findIndex(x => x.id === data.componentId);
            //     if(componentIndex !== -1) {
            //         console.log(`Updated => Component ${data.componentId} Player ${data.data.platformId}`);
            //         //(old[componentIndex] as ComponentSourceApiJson).players[data.data.platformId] = data.data;
            //         const newData = [...old];
            //         newData[componentIndex] = {
            //             ...old[componentIndex], 
            //             players: {
            //                 // @ts-ignore
            //             ...old[componentIndex].players,
            //             [data.data.platformId]: data.data
            //             }
            //         }
            //         return newData;
            //     }
            //     //console.log(old);
            // });
        }
        if(data.from === 'source') {
            console.log(data);
        } else if(data.from === 'client') {
            console.log(data);
        }
    }, []);

    return <span/>;
}

function App() {
  return (
      <Provider>
        <Container maxWidth="8xl">
            <Global/>
            <RouterProvider router={router}/>
        </Container>
      </Provider>
  );
}

export default App;
