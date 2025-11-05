import { useCallback, useEffect, useReducer, useState } from "react";

import tabularIcon from "../../../assets/tabular_icon.svg";
import { StatusMessage } from "../../../components/StatusMessage";
import { ToolShell, ToolShellIntro } from "../../../components/ToolShell";
import {
  DatasetMeta,
  OutlierParams,
  PreprocessPayload,
  boxPlot,
  corrMatrix,
  evaluateModel,
  getConfig,
  histogram,
  listDatasets,
  loadDatasetByKey,
  loadDatasetUpload,
  outlierApply,
  outlierCompute,
  preprocessFit,
  trainModel,
} from "../api";
import { ConfigDrawer } from "../components/ConfigDrawer";
import { DataPreview } from "../components/DataPreview";
import { DatasetPicker } from "../components/DatasetPicker";
import { EvalPanel } from "../components/EvalPanel";
import { OutlierPanel } from "../components/OutlierPanel";
import { PreprocessPanel } from "../components/PreprocessPanel";
import { TrainPanel } from "../components/TrainPanel";
import { VizPanel } from "../components/VizPanel";
import { initialState, tabularMLReducer } from "../state/tabularMLStore";

import "../../../styles/tabular_ml.css";

export function TabularMLPage() {
  const [state, dispatch] = useReducer(tabularMLReducer, initialState);
  const [error, setError] = useState<string | null>(null);
  const [outlierLoading, setOutlierLoading] = useState(false);
  const [vizLoading, setVizLoading] = useState(false);
  const [trainLoading, setTrainLoading] = useState(false);
  const [evalLoading, setEvalLoading] = useState(false);

  const handleError = useCallback((message: string) => {
    setError(message);
    setTimeout(() => setError(null), 5000);
  }, []);

  const handleDatasetSelect = useCallback(async (key: string) => {
    dispatch({ type: "selectDataset", key });
    dispatch({ type: "setLoading", key: "dataset", value: true });
    try {
      const preview = await loadDatasetByKey(key);
      dispatch({ type: "setPreview", preview });
      dispatch({ type: "setSession", sessionId: preview.session_id });
      dispatch({ type: "setPreprocess", preprocess: undefined });
      dispatch({ type: "setTrain", train: undefined });
      dispatch({ type: "setEvaluation", evaluation: undefined });
      dispatch({ type: "setOutliers", stats: undefined });
      dispatch({ type: "setHistogram", histogram: undefined });
      dispatch({ type: "setBox", box: undefined });
      dispatch({ type: "setCorr", corr: undefined });
    } catch (exc) {
      handleError((exc as Error).message || "Failed to load dataset");
    } finally {
      dispatch({ type: "setLoading", key: "dataset", value: false });
    }
  }, [handleError]);

  const loadDatasets = useCallback(async () => {
    try {
      const [config, datasetList] = await Promise.all([getConfig(), listDatasets()]);
      dispatch({ type: "setConfig", config });
      dispatch({ type: "setDatasets", datasets: datasetList.datasets });
      const defaultDataset = datasetList.datasets.find((dataset) => dataset.key === "titanic") || datasetList.datasets[0];
      if (defaultDataset) {
        await handleDatasetSelect(defaultDataset.key);
      }
    } catch (exc) {
      handleError((exc as Error).message || "Failed to load datasets");
    }
  }, [handleDatasetSelect, handleError]);

  const handleUpload = useCallback(async (file: File) => {
    dispatch({ type: "setLoading", key: "dataset", value: true });
    try {
      const preview = await loadDatasetUpload(file);
      dispatch({ type: "setPreview", preview });
      dispatch({ type: "setSession", sessionId: preview.session_id });
    } catch (exc) {
      handleError((exc as Error).message || "Failed to upload dataset");
    } finally {
      dispatch({ type: "setLoading", key: "dataset", value: false });
    }
  }, [handleError]);

  const handlePreprocess = useCallback(
    async (payload: PreprocessPayload) => {
      dispatch({ type: "setLoading", key: "preprocess", value: true });
      try {
        const summary = await preprocessFit(payload);
        dispatch({ type: "setPreprocess", preprocess: summary });
      } catch (exc) {
        handleError((exc as Error).message || "Preprocessing failed");
      } finally {
        dispatch({ type: "setLoading", key: "preprocess", value: false });
      }
    },
    [handleError],
  );

  const handleOutlierCompute = useCallback(
    async (method: "iqr" | "zscore" | "iforest", params: OutlierParams) => {
      if (!state.sessionId) {
        return;
      }
      setOutlierLoading(true);
      try {
        const report = await outlierCompute(state.sessionId, method, params);
        dispatch({
          type: "setOutliers",
          stats: {
            total: report.mask_stats.total_rows,
            removed: report.mask_stats.outlier_rows,
            kept: report.mask_stats.kept_rows,
          },
        });
      } catch (exc) {
        handleError((exc as Error).message || "Outlier detection failed");
      } finally {
        setOutlierLoading(false);
      }
    },
    [state.sessionId, handleError],
  );

  const handleOutlierApply = useCallback(
    async (action: "mask" | "drop" | "winsorize" | "reset", params: OutlierParams) => {
      if (!state.sessionId) {
        return;
      }
      try {
        await outlierApply(state.sessionId, action, params);
        if (action === "reset") {
          dispatch({ type: "setOutliers", stats: undefined });
        }
      } catch (exc) {
        handleError((exc as Error).message || "Failed to apply outliers");
      }
    },
    [state.sessionId, handleError],
  );

  const handleHistogramRequest = useCallback(
    async (params) => {
      if (!state.sessionId) {
        return;
      }
      setVizLoading(true);
      try {
        const result = await histogram(state.sessionId, params);
        dispatch({ type: "setHistogram", histogram: result });
      } catch (exc) {
        handleError((exc as Error).message || "Histogram failed");
      } finally {
        setVizLoading(false);
      }
    },
    [state.sessionId, handleError],
  );

  const handleBoxRequest = useCallback(
    async (params) => {
      if (!state.sessionId) {
        return;
      }
      setVizLoading(true);
      try {
        const result = await boxPlot(state.sessionId, params);
        dispatch({ type: "setBox", box: result });
      } catch (exc) {
        handleError((exc as Error).message || "Box plot failed");
      } finally {
        setVizLoading(false);
      }
    },
    [state.sessionId, handleError],
  );

  const handleCorrRequest = useCallback(
    async (columns?: string[]) => {
      if (!state.sessionId) {
        return;
      }
      setVizLoading(true);
      try {
        const result = await corrMatrix(state.sessionId, columns);
        dispatch({ type: "setCorr", corr: result });
      } catch (exc) {
        handleError((exc as Error).message || "Correlation failed");
      } finally {
        setVizLoading(false);
      }
    },
    [state.sessionId, handleError],
  );

  const handleTrain = useCallback(
    async (payload: { session_id: string; algo: "logreg" | "rf" | "mlp"; cv: number }) => {
      setTrainLoading(true);
      try {
        const result = await trainModel(payload);
        dispatch({ type: "setTrain", train: result });
      } catch (exc) {
        handleError((exc as Error).message || "Training failed");
      } finally {
        setTrainLoading(false);
      }
    },
    [handleError],
  );

  const handleEvaluate = useCallback(
    async (runId: string) => {
      setEvalLoading(true);
      try {
        const result = await evaluateModel(runId);
        dispatch({ type: "setEvaluation", evaluation: result });
      } catch (exc) {
        handleError((exc as Error).message || "Evaluation failed");
      } finally {
        setEvalLoading(false);
      }
    },
    [handleError],
  );

  useEffect(() => {
    loadDatasets();
  }, [loadDatasets]);

  const intro = (
    <ToolShellIntro
      icon={tabularIcon}
      title="Tabular ML"
      category="Machine Learning"
      summary="Load datasets, preprocess features, detect outliers, explore visualisations, and train classic ML models entirely offline."
      bullets={[
        "Auto-loads the Titanic dataset for instant exploration.",
        "Preprocessing supports per-column imputers, scaling, and encoding.",
        "Deterministic Random Forest, Logistic Regression, and MLP training with cross-validation.",
      ]}
    >
      <ConfigDrawer config={state.config} />
    </ToolShellIntro>
  );

  const workspace = (
    <div className="tabular-shell">
      {error ? <StatusMessage level="error" message={error} /> : null}
      <DatasetPicker
        datasets={state.datasets as DatasetMeta[]}
        selectedKey={state.selectedDataset}
        loading={state.loading.dataset}
        onSelect={handleDatasetSelect}
        onUpload={handleUpload}
        config={state.config}
      />
      <DataPreview preview={state.preview} />
      <PreprocessPanel
        sessionId={state.sessionId}
        columns={state.preview?.columns ?? []}
        summary={state.preprocess?.summary}
        loading={state.loading.preprocess}
        onSubmit={handlePreprocess}
      />
      <OutlierPanel
        sessionId={state.sessionId}
        stats={state.outlierStats}
        loading={outlierLoading}
        onCompute={handleOutlierCompute}
        onApply={handleOutlierApply}
      />
      <VizPanel
        sessionId={state.sessionId}
        columns={state.preview?.columns ?? []}
        histogram={state.histogram}
        box={state.box}
        corr={state.corr}
        loading={vizLoading}
        onHistogram={handleHistogramRequest}
        onBox={handleBoxRequest}
        onCorr={handleCorrRequest}
      />
      <TrainPanel
        sessionId={state.sessionId}
        preprocess={state.preprocess}
        result={state.train}
        loading={trainLoading}
        onTrain={handleTrain}
      />
      <EvalPanel
        runId={state.train?.run_id}
        evaluation={state.evaluation}
        loading={evalLoading}
        onEvaluate={handleEvaluate}
      />
    </div>
  );

  return <ToolShell intro={intro} workspace={workspace} className="tabular-layout" />;
}
