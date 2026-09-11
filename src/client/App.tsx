import { Box, Container } from '@chakra-ui/react';
import { SSEProvider } from "@flamefrontend/sse-runtime-react";
import {
    createBrowserRouter,
    createHashRouter,
    Outlet,
    type RouteObject,
    RouterProvider, useLocation
} from "react-router-dom";
import type {MsSseEvent} from '../core/Api';
import { AppHeader } from './components/AppHeader';
import { MSErrorBoundary } from './components/ErrorBoundary';
import { ComponentDetailedRoutable } from './components/msComponent/MSComponentDetailed';
import { MSComponentListFetchable } from './components/msComponent/MSComponentList';
import { Provider } from './components/Provider';
import { SettingsContainer } from './components/settings/settings';
import { Toaster } from './components/Toaster';
import { WelcomeToast } from './components/WelcomeToast';

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

<pre>npm run docs:install && npm run docs:build</pre>
            </code>
        </div>
    );
}

const Layout = () => {
    //const [logsEnabled, setLogsEnabled] = useState(true);
    const location = useLocation();
    return (<>
    <Box px="4" py="2" mb="4" pb="4" position="sticky" top="0" zIndex="1" bg="bg" borderBottomWidth="1px">
        <AppHeader fetchable/>
    </Box>
    <Container display="flex">
        <Box hideBelow="md" display="flex" flexDir="column" pr="2" gap="6" flexShrink="1"></Box>
        <Outlet/>
    </Container>
    </>);
}

const routesNested: RouteObject[] = [
    {
        path: "/",
        Component: Layout,
        children: [ 
        {
            index: true,
            element: <MSErrorBoundary><MSComponentListFetchable/></MSErrorBoundary>,
        },
        {
            path: "components/:componentId",
            element: <Container boxSize="full" p="0" maxWidth="8xl"><MSErrorBoundary><ComponentDetailedRoutable/></MSErrorBoundary></Container>
        },
        {
            path: "settings",
            element: <Container p="0" boxSize="full" maxWidth="4xl"><MSErrorBoundary><SettingsContainer/></MSErrorBoundary></Container>
        },
        {
        path: "*",
        element: <NoMatch/>
        }
        ],
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
    return useHashRouter ? createHashRouter(routesNested) : createBrowserRouter(routesNested);
}

const router = genRouter();

export const sseProviderOptions = {
    key: ['events'],
    url: '/api/events?next=true'
}

function App() {
  return (
      <Provider>
            <Toaster/>
            <WelcomeToast/>
        {/* <Box px="4" py="2" pb="4"><AppHeader fetchable/></Box> */}
            <SSEProvider<MsSseEvent> options={sseProviderOptions}>
            <RouterProvider router={router}/>
            </SSEProvider>
      </Provider>
  );
}

export default App;
