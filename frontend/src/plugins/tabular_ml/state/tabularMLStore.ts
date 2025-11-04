import type {
  BoxResponse,
  ConfigResponse,
  CorrResponse,
  DatasetMeta,
  DatasetPreview,
  EvaluateResponse,
  HistogramResponse,
  PreprocessResponse,
  TrainResponse,
} from "../api";

export type TabularMLState = {
  datasets: DatasetMeta[];
  selectedDataset?: string;
  preview?: DatasetPreview;
  preprocess?: PreprocessResponse;
  histogram?: HistogramResponse;
  box?: BoxResponse;
  corr?: CorrResponse;
  outlierStats?: { total: number; removed: number; kept: number };
  train?: TrainResponse;
  evaluation?: EvaluateResponse;
  config?: ConfigResponse;
  sessionId?: string;
  loading: Partial<Record<"dataset" | "preprocess" | "outliers" | "viz" | "train" | "evaluate", boolean>>;
  error?: string | null;
};

export const initialState: TabularMLState = {
  datasets: [],
  loading: {},
  error: null,
};

export type TabularMLAction =
  | { type: "setDatasets"; datasets: DatasetMeta[] }
  | { type: "selectDataset"; key: string }
  | { type: "setPreview"; preview: DatasetPreview }
  | { type: "setPreprocess"; preprocess?: PreprocessResponse }
  | { type: "setHistogram"; histogram?: HistogramResponse }
  | { type: "setBox"; box?: BoxResponse }
  | { type: "setCorr"; corr?: CorrResponse }
  | { type: "setOutliers"; stats?: { total: number; removed: number; kept: number } }
  | { type: "setTrain"; train?: TrainResponse }
  | { type: "setEvaluation"; evaluation?: EvaluateResponse }
  | { type: "setConfig"; config: ConfigResponse }
  | { type: "setSession"; sessionId: string }
  | { type: "setLoading"; key: keyof TabularMLState["loading"]; value: boolean }
  | { type: "setError"; message: string | null };

export function tabularMLReducer(state: TabularMLState, action: TabularMLAction): TabularMLState {
  switch (action.type) {
    case "setDatasets":
      return { ...state, datasets: action.datasets };
    case "selectDataset":
      return { ...state, selectedDataset: action.key };
    case "setPreview":
      return { ...state, preview: action.preview, sessionId: action.preview.session_id };
    case "setPreprocess":
      return { ...state, preprocess: action.preprocess };
    case "setHistogram":
      return { ...state, histogram: action.histogram };
    case "setBox":
      return { ...state, box: action.box };
    case "setCorr":
      return { ...state, corr: action.corr };
    case "setOutliers":
      return { ...state, outlierStats: action.stats };
    case "setTrain":
      return { ...state, train: action.train };
    case "setEvaluation":
      return { ...state, evaluation: action.evaluation };
    case "setConfig":
      return { ...state, config: action.config };
    case "setSession":
      return { ...state, sessionId: action.sessionId };
    case "setLoading":
      return { ...state, loading: { ...state.loading, [action.key]: action.value } };
    case "setError":
      return { ...state, error: action.message };
    default:
      return state;
  }
}
