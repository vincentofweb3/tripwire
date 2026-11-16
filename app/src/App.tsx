import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./routes/Home";
import { Trade } from "./routes/Trade";
import { Evidence } from "./routes/Evidence";
import { Recover } from "./routes/Recover";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "trade", element: <Trade /> },
      { path: "evidence", element: <Evidence /> },
      { path: "recovery", element: <Recover /> }
    ]
  }
]);

export function App() {
  return <RouterProvider router={router} />;
}
