import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import MapPage from "./pages/MapPage.jsx";
import ResearchPage from "./pages/ResearchPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/map" element={<MapPage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
