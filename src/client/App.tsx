import React from 'react';
import logo from './logo.svg';
import * as ReactDOM from "react-dom/client";
import {
    createBrowserRouter,
    RouterProvider, useLocation,
} from "react-router-dom";
import { Provider } from 'react-redux'
import './App.css';
import {store} from './store';
import Dashboard from "./dashboard/dashboard";
import RecentPage from "./recent/RecentPage";

function NoMatch() {
    let location = useLocation();

    return (
        <div>
                No page for <code>{location.pathname}</code> exists!
        </div>
    );
}

const router = createBrowserRouter([
    {
        path: "/",
        element: <Dashboard />,
    },
    {
        path: "/recent",
        element: <RecentPage />,
    },
    {
        path: "*",
        element: <NoMatch/>
    }
]);

function App() {
  return (
      <Provider store={store}>
      <div className="min-w-screen min-h-screen bg-gray-800 font-sans text-white">
        <div className="space-x-4 p-6 md:px-10 md:py-6 leading-6 font-semibold bg-gray-800 text-white">
          <div className="container mx-auto">
            <div className="flex items-center justify-between">
              <a href="/" className="flex items-center flex-grow no-underline pr-4">
                <img src="icon.svg" style={{maxWidth: '30px'}}/>
                <span className="px-4 break-normal">
                        Multi Scrobbler
                    </span>
              </a>
            </div>
          </div>
        </div>
        <div className="container mx-auto">
            <RouterProvider router={router}/>
        </div>
      </div>
      </Provider>
  );
}

export default App;
