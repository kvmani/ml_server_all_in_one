import { apiFetch } from "../../utils/api";

export type DatasetMeta = {
  key: string;
  name: string;
  rows: number;
  cols: number;
  license?: string;
};

export type ColumnMeta = {
  name: string;
  dtype: string;
  missing: number;
  is_numeric: boolean;
};

export type DatasetPreview = {
  session_id: string;
  head: Array<Record<string, unknown>>;
  dtypes: Record<string, string>;
  columns: ColumnMeta[];
  shape: [number, number];
};

export type DatasetListResponse = { datasets: DatasetMeta[] };

export async function listDatasets(): Promise<DatasetListResponse> {
  return apiFetch<DatasetListResponse>("/api/tabular_ml/datasets/list");
}

export async function loadDatasetByKey(key: string): Promise<DatasetPreview> {
  return apiFetch<DatasetPreview>("/api/tabular_ml/datasets/load", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
}

export async function loadDatasetUpload(file: File): Promise<DatasetPreview> {
  const form = new FormData();
  form.append("csv", file);
  return apiFetch<DatasetPreview>("/api/tabular_ml/datasets/load", {
    method: "POST",
    body: form,
  });
}

export type SplitConfig = { train: number; seed: number };
export type ImputeConfig = {
  numeric: "mean" | "median" | "most_frequent";
  categorical: "most_frequent" | "constant";
  fill_value?: string | null;
};
export type ScaleConfig = { method: "none" | "standard" | "minmax" };
export type EncodeConfig = { one_hot: boolean; drop_first: boolean };

export type PreprocessPayload = {
  session_id: string;
  target: string;
  split: SplitConfig;
  impute: ImputeConfig;
  scale: ScaleConfig;
  encode: EncodeConfig;
};

export type PreprocessResponse = {
  summary: {
    target: string;
    task: "classification" | "regression";
    rows: { train: number; test: number };
    numeric_columns: string[];
    categorical_columns: string[];
  };
  columns: string[];
};

export async function preprocessFit(payload: PreprocessPayload): Promise<PreprocessResponse> {
  return apiFetch<PreprocessResponse>("/api/tabular_ml/preprocess/fit_apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type OutlierParams = { k?: number; z?: number; contamination?: number };

export type OutlierComputeResponse = {
  mask_stats: { total_rows: number; outlier_rows: number; kept_rows: number };
  indices_removed: number[];
};

export async function outlierCompute(
  session_id: string,
  method: "iqr" | "zscore" | "iforest",
  params: OutlierParams,
): Promise<OutlierComputeResponse> {
  return apiFetch<OutlierComputeResponse>("/api/tabular_ml/outliers/compute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, method, params }),
  });
}

export type OutlierApplyResponse =
  | { status: "mask"; mask_stats: { masked_rows: number; unmasked_rows: number } }
  | { status: "drop" | "winsorize" | "reset"; rows?: number; columns?: ColumnMeta[] };

export async function outlierApply(
  session_id: string,
  action: "mask" | "drop" | "winsorize" | "reset",
  params: OutlierParams,
): Promise<OutlierApplyResponse> {
  return apiFetch<OutlierApplyResponse>("/api/tabular_ml/outliers/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, action, params }),
  });
}

export type HistogramResponse = {
  column: string;
  bins: number;
  counts: number[];
  bin_edges: number[];
  centres: number[];
  kde?: { x: number[]; y: number[] };
};

export async function histogram(
  session_id: string,
  payload: { column: string; bins: number | "auto"; log: boolean; kde: boolean; range?: [number, number] | null },
): Promise<HistogramResponse> {
  return apiFetch<HistogramResponse>("/api/tabular_ml/viz/histogram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, ...payload }),
  });
}

export type BoxResponse = {
  column: string;
  group_stats: Record<string, { min: number; q1: number; median: number; q3: number; max: number }>;
};

export async function boxPlot(session_id: string, payload: { column: string; by?: string | null }): Promise<BoxResponse> {
  return apiFetch<BoxResponse>("/api/tabular_ml/viz/box", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, ...payload }),
  });
}

export type CorrResponse = { labels: string[]; matrix: number[][] };

export async function corrMatrix(session_id: string, columns?: string[]): Promise<CorrResponse> {
  return apiFetch<CorrResponse>("/api/tabular_ml/viz/corr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, columns }),
  });
}

export type TrainResponse = {
  run_id: string;
  model_summary: {
    task: "classification" | "regression";
    target: string;
    algorithm: "logreg" | "rf" | "mlp";
    metrics: Record<string, number>;
    feature_importances?: Record<string, number>;
  };
  feature_importances?: Record<string, number> | null;
};

export async function trainModel(payload: { session_id: string; algo: "logreg" | "rf" | "mlp"; cv: number }): Promise<TrainResponse> {
  return apiFetch<TrainResponse>("/api/tabular_ml/model/train", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type EvaluateResponse = {
  metrics: Record<string, number>;
  model: { task: string | null; target: string | null; algorithm: string | null };
  curves?: { roc?: { fpr: number[]; tpr: number[] } | null; pr?: { precision: number[]; recall: number[] } | null };
  feature_importances?: Record<string, number>;
};

export async function evaluateModel(run_id: string): Promise<EvaluateResponse> {
  const url = new URL("/api/tabular_ml/model/evaluate", window.location.origin);
  url.searchParams.set("run_id", run_id);
  return apiFetch<EvaluateResponse>(url.toString());
}

export type ConfigResponse = { upload: { max_mb: number; max_files: number; max_columns: number; max_rows: number } };

export async function getConfig(): Promise<ConfigResponse> {
  return apiFetch<ConfigResponse>("/api/tabular_ml/system/config");
}
