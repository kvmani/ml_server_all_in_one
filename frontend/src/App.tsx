import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { useAppContext } from "./contexts/AppContext";
import { useTheme } from "./hooks/useTheme";
import ErrorPage from "./pages/ErrorPage";
import HelpPage from "./pages/HelpPage";
import HomePage from "./pages/HomePage";
import HydrideSegmentationPage from "./pages/HydrideSegmentationPage";
import PdfToolsPage from "./pages/PdfToolsPage";
import TabularMlPage from "./pages/TabularMlPage";
import UnitConverterPage from "./pages/UnitConverterPage";

function AppContent() {
  const { currentTheme } = useAppContext();
  useTheme(currentTheme);

  return (
    <Layout>
      <LoadingOverlay />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/tools/pdf_tools" element={<PdfToolsPage />} />
        <Route path="/pdf_tools/*" element={<Navigate to="/tools/pdf_tools" replace />} />
        <Route path="/tools/unit_converter" element={<UnitConverterPage />} />
        <Route path="/unit_converter/*" element={<Navigate to="/tools/unit_converter" replace />} />
        <Route path="/tools/hydride_segmentation" element={<HydrideSegmentationPage />} />
        <Route path="/hydride_segmentation/*" element={<Navigate to="/tools/hydride_segmentation" replace />} />
        <Route path="/tools/tabular_ml" element={<TabularMlPage />} />
        <Route path="/tabular_ml/*" element={<Navigate to="/tools/tabular_ml" replace />} />
        <Route path="/help/:slug" element={<HelpPage />} />
        <Route path="*" element={<ErrorPage status={404} title="Page not found" message="The requested route does not exist." />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}
