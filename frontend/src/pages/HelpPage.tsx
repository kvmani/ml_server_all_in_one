import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import ErrorPage from "./ErrorPage";
import { useAppContext } from "../contexts/AppContext";
import { usePluginSettings } from "../hooks/usePluginSettings";
import type { PluginManifest } from "../types";

type Section = {
  heading: string;
  ordered?: string[];
  unordered?: string[];
  body?: string;
  hint?: string;
};

type DirectoryEntry = {
  slug: string;
  title: string;
  summary: string;
  hint?: string;
};

type HelpContent = {
  category: string;
  title: string;
  subtitle: string;
  sections: Section[];
  directory?: DirectoryEntry[];
};

type BuilderOptions = {
  settings: Record<string, unknown>;
  manifests: PluginManifest[];
  pluginSettings: Record<string, Record<string, unknown>>;
  siteDescription?: string;
  currentTheme: string;
};

type HelpBuilder = (options: BuilderOptions) => HelpContent;

const HELP_BUILDERS: Record<string, HelpBuilder> = {
  pdf_tools: ({ settings }) => {
    const mergeUpload = (settings.merge_upload as Record<string, unknown>) || {};
    const splitUpload = (settings.split_upload as Record<string, unknown>) || {};
    const mergeLimit = Number(mergeUpload.max_files ?? 10);
    const mergeMb = Number(mergeUpload.max_mb ?? 5);
    const splitMb = Number(splitUpload.max_mb ?? 5);
    return {
      category: "Document workflows",
      title: "PDF Tools guidance",
      subtitle:
        "Merge and split PDF packets offline with drag-and-drop queues, page range validation, and instant downloads.",
      sections: [
        {
          heading: "Merge workflow",
          ordered: [
            `Add up to ${mergeLimit} PDFs (${mergeMb} MB each) via drag-and-drop or the Add files button.`,
            "For each file, specify page ranges using commas and hyphen syntax (e.g., 1-3,5).",
            "Reorder entries with the handles in the queue, then provide an output filename.",
            "Submit the form to download the merged document instantly; no data is stored on disk.",
          ],
        },
        {
          heading: "Split workflow",
          unordered: [
            `Drop a single PDF up to ${splitMb} MB.`,
            "Each page is returned as a base64-encoded string for offline conversion to files; the UI offers direct downloads for convenience.",
            "Large PDFs may take a few seconds—keep the tab active until the queue completes.",
          ],
        },
        {
          heading: "Tips",
          unordered: [
            "Use descriptive output filenames to avoid overwriting earlier exports.",
            "Invalid page expressions trigger inline errors; correct them before re-submitting.",
            "The queue preserves upload order—clear it after each merge to avoid accidental reuse.",
          ],
        },
      ],
    };
  },
  unit_converter: () => ({
    category: "Reference utilities",
    title: "Unit Converter guidance",
    subtitle:
      "Perform fast conversions across engineering units with Pint-backed accuracy, interval support, and expression evaluation.",
    sections: [
      {
        heading: "Using the workspace",
        ordered: [
          "Pick a unit family (length, pressure, thermal conductivity, etc.). Only compatible units are listed.",
          "Enter a numeric value; decimal and scientific notation are both accepted. Interval mode keeps temperature offsets intact.",
          "Optional: define significant figures, decimal precision, or switch to scientific/engineering notation.",
          "Submit the form to see the converted value plus the base SI quantity used for verification.",
        ],
      },
      {
        heading: "Expression evaluator",
        body:
          "The expression panel accepts compound calculations such as 5 kJ/mol to eV or 980 cm^3 * 7 g/cm^3. If the expression omits a target unit, supply it separately. Formatting controls mirror the main converter.",
      },
      {
        heading: "Reference & accuracy",
        unordered: [
          "Unit definitions are sourced from pint==0.23 with additional engineering aliases defined in plugins/unit_converter/core/registry.py.",
          "Temperature interval conversions leverage Pint's delta units (e.g., delta_degC) to avoid offset drift.",
          "Electron volt ↔ molar energy conversions use Avogadro's constant with double precision and round-half-up formatting.",
        ],
      },
    ],
  }),
  hydride_segmentation: ({ settings }) => {
    const upload = (settings.upload as Record<string, unknown>) || {};
    const maxMb = Number(upload.max_mb ?? 5);
    return {
      category: "Hydride analysis",
      title: "Hydride Segmentation guidance",
      subtitle:
        "Segment zirconium alloy micrographs using the conventional pipeline with tunable preprocessing and thresholding options.",
      sections: [
        {
          heading: "Workflow summary",
          ordered: [
            `Drop a PNG, JPEG, or TIFF image (max ${maxMb} MB) into the workspace.`,
            "Select the Conventional backend to expose manual parameters or choose the ML proxy for auto defaults.",
            "Tune CLAHE, adaptive threshold, and morphology settings as needed, then run segmentation.",
            "Review the generated mask, overlay, and analysis metrics. Use the history controls to compare successive runs.",
          ],
        },
        {
          heading: "Parameter reference",
          unordered: [
            "CLAHE clip limit: Enhances local contrast. Lower values preserve smooth regions; higher values sharpen edges.",
            "Adaptive window / offset: Control the local threshold. Increase the window to smooth noise, adjust offset to tighten or relax masks.",
            "Morphology kernel & iterations: Define how aggressively neighbouring hydrides are joined. Start with the defaults and increase gradually.",
            "Area threshold: Removes small speckles. Lower it when detecting very fine hydrides.",
            "Crop percent: Trim mounting artefacts at the bottom of the frame before segmentation.",
          ],
        },
        {
          heading: "Troubleshooting",
          unordered: [
            "If the mask is empty, reduce the adaptive offset or area threshold and verify the input exposure.",
            "For overly merged hydrides, decrease morphology iterations or kernel size.",
            "Use the download buttons in the results panel to export PNG artefacts for record keeping.",
          ],
          hint: "All processing occurs in memory; refresh the page to purge the session.",
        },
      ],
    };
  },
  tabular_ml: ({ settings }) => {
    const upload = (settings.upload as Record<string, unknown>) || {};
    const maxMb = Number(upload.max_mb ?? 2);
    return {
      category: "Machine learning",
      title: "Tabular ML guidance",
      subtitle:
        "Train offline models on CSV datasets with dataset profiling, scatter plots, and automatic task detection.",
      sections: [
        {
          heading: "Preparing datasets",
          unordered: [
            "Ensure the first row contains column headers; the target column name must match one of the headers exactly.",
            "Only numeric feature columns are used for training. Categorical predictors should be encoded before upload.",
            `File size is capped at ${maxMb} MB to guarantee sub-second parsing in the air-gapped environment.`,
          ],
        },
        {
          heading: "Workflow",
          ordered: [
            "Upload the CSV. A preview table and column summary appear once the dataset is cached in memory.",
            "Use the scatter plot form to explore numeric relationships. Choose optional colour encodings to highlight clusters.",
            "Provide the target column and start training. The backend infers classification vs. regression automatically.",
            "Review metrics and top features, then clear the dataset to load a new file.",
          ],
        },
        {
          heading: "Reading the results",
          unordered: [
            "Metrics: Classification reports accuracy; regression reports root-mean-square error (RMSE).",
            "Feature importance: Derived from the absolute model coefficients after standard scaling. Values are sorted descending and shown for the top five features.",
            "Scatter plots are rendered with inline SVG; use browser zoom or theme toggle for presentation-ready captures.",
          ],
        },
      ],
    };
  },
  overview: ({ manifests, pluginSettings, siteDescription, currentTheme }) => {
    const directory: DirectoryEntry[] = manifests.map((manifest) => {
      const settings = pluginSettings[manifest.blueprint] || {};
      let hint: string | undefined;
      if ((settings as Record<string, unknown>).upload) {
        const upload = (settings.upload as Record<string, unknown>) || {};
        const files = upload.max_files ?? 1;
        const mb = upload.max_mb ?? upload.max_size ?? 5;
        hint = `Upload limit: ${files} file(s), ${mb} MB each.`;
      } else if ((settings as Record<string, unknown>).merge_upload) {
        const mergeUpload = (settings.merge_upload as Record<string, unknown>) || {};
        const files = mergeUpload.max_files ?? 10;
        const mb = mergeUpload.max_mb ?? 5;
        hint = `Merge up to ${files} files (${mb} MB each).`;
      }
      return {
        slug: manifest.blueprint,
        title: manifest.title,
        summary: manifest.summary,
        hint,
      };
    });

    return {
      category: "Documentation hub",
      title: "ML Server All-In-One help center",
      subtitle:
        siteDescription ||
        "Offline toolkit providing segmentation, document processing, analytics, and conversions. Use this hub to explore workflows, configuration knobs, and troubleshooting tips for each integrated tool.",
      sections: [
        {
          heading: "Quick start",
          ordered: [
            "Install dependencies following the README instructions in the repository root.",
            "Review config.yml to set upload limits, default theme, and help links before starting the server.",
            `Run python scripts/run_dev.py and open http://localhost:5000/?theme=${currentTheme} to explore tools.`,
            "Visit each tool's help page below for detailed workflows and parameter explanations.",
          ],
        },
        {
          heading: "Platform configuration",
          body:
            "Global behaviour is controlled via config.yml. Key options include site name, theme palette, maximum upload sizes, and per-plugin documentation links. Changes are picked up on the next application restart.",
          unordered: [
            `Theme options: ${manifests.length ? "Multiple selectable palettes" : "Single theme"}.`,
            `Default theme: ${currentTheme}.`,
            "Uploads are processed entirely in memory; adjust size caps to fit workstation constraints.",
          ],
        },
      ],
      directory,
    };
  },
};

export default function HelpPage() {
  const { slug } = useParams<{ slug: string }>();
  const effectiveSlug = slug ?? "overview";
  const { manifests, pluginSettings, siteSettings, currentTheme } = useAppContext();
  const settings = usePluginSettings(effectiveSlug, {});

  const builder = HELP_BUILDERS[effectiveSlug];
  const content = useMemo(() => {
    if (!builder) {
      return null;
    }
    return builder({
      settings,
      manifests,
      pluginSettings,
      siteDescription: siteSettings.description,
      currentTheme,
    });
  }, [builder, currentTheme, manifests, pluginSettings, settings, siteSettings.description]);

  if (!content) {
    return <ErrorPage status={404} title="Help not found" message="This help article is unavailable." />;
  }

  return (
    <section className="shell surface-block help-content" aria-labelledby={`help-${effectiveSlug}-title`}>
      <header>
        <p className="tool-card__category">{content.category}</p>
        <h1 id={`help-${effectiveSlug}-title`} className="section-heading">
          {content.title}
        </h1>
        <p className="hero__subtitle">{content.subtitle}</p>
      </header>
      {content.sections.map((section) => (
        <article key={section.heading} className="surface-muted help-section">
          <h2>{section.heading}</h2>
          {section.body ? <p>{section.body}</p> : null}
          {section.ordered ? (
            <ol>
              {section.ordered.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ol>
          ) : null}
          {section.unordered ? (
            <ul className="list-reset">
              {section.unordered.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          ) : null}
          {section.hint ? <p className="form-field__hint">{section.hint}</p> : null}
        </article>
      ))}
      {content.directory ? (
        <section aria-labelledby="help-directory-title">
          <h2 id="help-directory-title">Tool directory</h2>
          <div className="help-grid">
            {content.directory.map((entry) => (
              <article key={entry.slug} className="surface-muted help-section">
                <h3>{entry.title}</h3>
                <p className="hero__subtitle">{entry.summary}</p>
                {entry.hint ? <p className="form-field__hint">{entry.hint}</p> : null}
                <div className="tool-card__actions">
                  <Link className="btn" data-keep-theme to={`/tools/${entry.slug}`}>
                    Open tool
                  </Link>
                  <Link className="btn btn--subtle" data-keep-theme to={`/help/${entry.slug}`}>
                    Help
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
