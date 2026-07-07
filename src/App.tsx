import Titlebar from "./components/Titlebar";
import Sidebar from "./components/Sidebar";
import GridArea from "./components/GridArea";
import InfoPanel from "./components/InfoPanel";
import Viewer from "./components/Viewer";
import { Toasts } from "./components/Overlays";

export default function App() {
  return (
    <div className="app">
      <Titlebar />
      <div className="app-body">
        <Sidebar />
        <GridArea />
        <InfoPanel />
      </div>
      <Viewer />
      <Toasts />
    </div>
  );
}
