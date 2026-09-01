import { createRoot } from "react-dom/client";
import "./index.css";
import { Editor } from "./pages/editor/Editor";

/**
 * Mounts the page the URL asks for. The editor is the only page there is, so every URL is it —
 * the server answers `/` and nothing else. A second page turns this into a lookup.
 */
createRoot(document.getElementById("root")!).render(<Editor />);
