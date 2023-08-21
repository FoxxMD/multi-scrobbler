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
                <img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyODkuNTUgMTM1LjE3Ij48ZGVmcz48c3R5bGU+LmNscy0xe2ZpbGw6IzNkNTNhNDt9LmNscy0ye2ZpbGw6I2ZmZjt9PC9zdHlsZT48L2RlZnM+PGcgaWQ9IkxheWVyXzEiIGRhdGEtbmFtZT0iTGF5ZXIgMSI+PHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMTI5Ljg3LDE3My4zNCwzOS4zOCwyNjMuODNaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMTYuOTkgLTE1MSkiLz48cGF0aCBjbGFzcz0iY2xzLTIiIGQ9Ik0xMTQsMTU3LjQzbC03OS4zOSw3OS40LTExLjEsMTEuMDljLTguMzMsOC4zNC04Ljk1LDIzLjYsMCwzMS44MnMyMi45Myw4LjksMzEuODIsMGw3OS40LTc5LjM5LDExLjA5LTExLjFjOC4zMy04LjMzLDktMjMuNiwwLTMxLjgycy0yMi45My04Ljg5LTMxLjgyLDBsLTc5LjM5LDc5LjQtMTEuMSwxMS4wOWMtOC4zMyw4LjM0LTguOTUsMjMuNiwwLDMxLjgyczIyLjkzLDguOSwzMS44MiwwbDc5LjQtNzkuMzksMTEuMDktMTEuMWM4LjMzLTguMzMsOS0yMy42LDAtMzEuODJTMTIyLjg1LDE0OC41NCwxMTQsMTU3LjQzWiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoLTE2Ljk5IC0xNTEpIi8+PC9nPjxnIGlkPSJMYXllcl8xX2NvcHkiIGRhdGEtbmFtZT0iTGF5ZXIgMSBjb3B5Ij48cGF0aCBjbGFzcz0iY2xzLTIiIGQ9Ik0xOTEuODgsMTU3LjQzbC03OS40LDc5LjQtMTEuMSwxMS4wOWMtOC4zMyw4LjM0LTguOTUsMjMuNiwwLDMxLjgyczIyLjkzLDguOSwzMS44MiwwbDc5LjQtNzkuMzksMTEuMS0xMS4xYzguMzMtOC4zMyw5LTIzLjYsMC0zMS44MnMtMjIuOTMtOC44OS0zMS44MiwwbC03OS40LDc5LjQtMTEuMSwxMS4wOWMtOC4zMyw4LjM0LTguOTUsMjMuNiwwLDMxLjgyczIyLjkzLDguOSwzMS44MiwwbDc5LjQtNzkuMzksMTEuMS0xMS4xYzguMzMtOC4zMyw5LTIzLjYsMC0zMS44MlMyMDAuNzcsMTQ4LjU0LDE5MS44OCwxNTcuNDNaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMTYuOTkgLTE1MSkiLz48L2c+PGcgaWQ9IkxheWVyXzFfY29weV8yIiBkYXRhLW5hbWU9IkxheWVyIDEgY29weSAyIj48cGF0aCBjbGFzcz0iY2xzLTIiIGQ9Ik0yNjguMjMsMTU3LjQzbC0yOC43NywyOC43OGMtOC4zNCw4LjMzLTksMjMuNiwwLDMxLjgyczIyLjkyLDguODksMzEuODIsMGwyOC43Ny0yOC43OGM4LjMzLTguMzMsOS0yMy42LDAtMzEuODJzLTIyLjkzLTguODktMzEuODIsMGwtMjguNzcsMjguNzhjLTguMzQsOC4zMy05LDIzLjYsMCwzMS44MnMyMi45Miw4Ljg5LDMxLjgyLDBsMjguNzctMjguNzhjOC4zMy04LjMzLDktMjMuNiwwLTMxLjgyUzI3Ny4xMiwxNDguNTQsMjY4LjIzLDE1Ny40M1oiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC0xNi45OSAtMTUxKSIvPjwvZz48ZyBpZD0iTGF5ZXJfMV9jb3B5XzMiIGRhdGEtbmFtZT0iTGF5ZXIgMSBjb3B5IDMiPjxwYXRoIGNsYXNzPSJjbHMtMiIgZD0iTTIwMy40OSwyMjIuMTcsMTc5LjEsMjQ2LjU2Yy04LjMzLDguMzQtOC45NSwyMy42LDAsMzEuODJzMjIuOTMsOC45LDMxLjgyLDBMMjM1LjMxLDI1NGM4LjM0LTguMzMsOS0yMy42LDAtMzEuODJzLTIyLjkyLTguODktMzEuODIsMEwxNzkuMSwyNDYuNTZjLTguMzMsOC4zNC04Ljk1LDIzLjYsMCwzMS44MnMyMi45Myw4LjksMzEuODIsMEwyMzUuMzEsMjU0YzguMzQtOC4zMyw5LTIzLjYsMC0zMS44MlMyMTIuMzksMjEzLjI4LDIwMy40OSwyMjIuMTdaIiB0cmFuc2Zvcm09InRyYW5zbGF0ZSgtMTYuOTkgLTE1MSkiLz48L2c+PC9zdmc+" style={{maxWidth: '100px', maxHeight: '30px'}}/>
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
