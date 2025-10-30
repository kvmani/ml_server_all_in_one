import { useMemo } from "react";
import { Layout } from "./components/Layout";
import { useAppContext } from "./contexts/AppContext";
import { useTheme } from "./hooks/useTheme";
import HomePage from "./pages/HomePage";
import PdfToolsPage from "./pages/PdfToolsPage";
import UnitConverterPage from "./pages/UnitConverterPage";
import HydrideSegmentationPage from "./pages/HydrideSegmentationPage";
import TabularMlPage from "./pages/TabularMlPage";
import ErrorPage from "./pages/ErrorPage";

const PAGE_COMPONENTS: Record<string, React.ComponentType<{ props: Record<string, unknown> }>> = {
  home: HomePage,
  pdf_tools: PdfToolsPage,
  unit_converter: UnitConverterPage,
  hydride_segmentation: HydrideSegmentationPage,
  tabular_ml: TabularMlPage,
  error: ErrorPage,
};

export default function App() {
  const { page, props, currentTheme } = useAppContext();
  useTheme(currentTheme);

  const PageComponent = useMemo(() => PAGE_COMPONENTS[page] ?? ErrorPage, [page]);

  return (
    <Layout>
      <PageComponent props={props} />
    </Layout>
  );
}
