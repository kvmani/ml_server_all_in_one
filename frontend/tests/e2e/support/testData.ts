import type { TestInfo } from "@playwright/test";

export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWNgYGAAAABQAAEnNCcSAAAAAElFTkSuQmCC";

export const STATIC_BASE = "/static/react";

export const SAMPLE_PDF_BUFFER = Buffer.from(
  "%PDF-1.4\n1 0 obj<<>>endobj\nxref\n0 1\n0000000000 65535 f \ntrailer<<>>\nstartxref\n0\n%%EOF\n",
  "utf-8",
);

export const SAMPLE_PDF_BASE64 = SAMPLE_PDF_BUFFER.toString("base64");

export const SAMPLE_CSV_BUFFER = Buffer.from(
  "temperature,hardness,material\n350,120.5,Zircaloy\n340,118.2,Zircaloy\n",
  "utf-8",
);

export const DATASET_PROFILE = {
  dataset_id: "sample-dataset-id",
  columns: [
    { name: "temperature", dtype: "float", missing: 0, is_numeric: true },
    { name: "hardness", dtype: "float", missing: 0, is_numeric: true },
    { name: "material", dtype: "category", missing: 0, is_numeric: false },
  ],
  preview: [
    { temperature: 350, hardness: 120.5, material: "Zircaloy" },
    { temperature: 340, hardness: 118.2, material: "Zircaloy" },
  ],
  shape: [2, 3] as [number, number],
  stats: {
    temperature: { mean: 345, std: 7.07, min: 340, max: 350 },
    hardness: { mean: 119.35, std: 1.3, min: 118.2, max: 120.5 },
  },
  numeric_columns: ["temperature", "hardness"],
};

export const SCATTER_DATA = {
  x: [340, 350],
  y: [118.2, 120.5],
  color: ["baseline", "treated"],
  color_mode: "category" as const,
  color_label: "material",
  x_label: "temperature",
  y_label: "hardness",
};

export const TRAINING_RESULT = {
  task: "regression",
  algorithm: "gradient_boosting",
  algorithm_label: "Gradient boosting",
  metrics: { r2: 0.9241, mae: 0.86 },
  feature_importance: { temperature: 0.72, hardness: 0.28 },
  columns: ["temperature", "prediction"],
  preview: [
    { temperature: 350, prediction: 120.1 },
    { temperature: 340, prediction: 118.7 },
  ],
  rows: 2,
  feature_columns: ["temperature"],
  target: "hardness",
};

export const INFERENCE_RESULT = {
  prediction: 119.4,
  task: "regression",
  target: "hardness",
};

export const BATCH_PREVIEW = {
  columns: ["temperature", "prediction"],
  preview: [
    { temperature: 330, prediction: 117.9 },
    { temperature: 360, prediction: 121.4 },
  ],
  rows: 2,
};

export const PDF_METADATA = { pages: 12, size_bytes: 1024 * 256 };

export const PDF_SPLIT_PAGES = [SAMPLE_PDF_BASE64, SAMPLE_PDF_BASE64];

export const UNIT_CONVERT_RESPONSE = {
  formatted: "273.15",
  unit: "K",
  base: { value: 273.15, unit: "kelvin" },
};

export const UNIT_EXPRESSION_RESPONSE = {
  formatted: "8.314",
  unit: "kJ/(kmol*K)",
};

export const SEGMENTATION_RESPONSE = {
  input_png_b64: TINY_PNG_BASE64,
  mask_png_b64: TINY_PNG_BASE64,
  overlay_png_b64: TINY_PNG_BASE64,
  analysis: {
    orientation_map_png_b64: TINY_PNG_BASE64,
    size_histogram_png_b64: TINY_PNG_BASE64,
    angle_histogram_png_b64: TINY_PNG_BASE64,
    combined_panel_png_b64: TINY_PNG_BASE64,
  },
  metrics: {
    mask_area_fraction: 0.1542,
    mask_area_fraction_percent: 15.42,
    hydride_count: 42,
  },
  logs: [
    "Loaded image sample.png (1024x1024)",
    "Applied CLAHE and adaptive threshold",
    "Generated overlay in 0.42s",
  ],
  parameters: {
    model: "conventional",
    clahe_clip_limit: 2.0,
    crop_percent: 10,
  },
};

export async function attachJSON(testInfo: TestInfo, name: string, data: unknown) {
  await testInfo.attach(name, {
    body: JSON.stringify(data, null, 2),
    contentType: "application/json",
  });
}
