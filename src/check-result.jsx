import React from "react";
import { THEME as T } from "./config.jsx";

/**
 * The outcome of a preflight() check: what replaces what, blocking problems,
 * warnings, the pass line and the informational findings. Shared by the paste
 * Publisher and the programme editor so the two can never report differently.
 */
export function CheckResult({ result, when }) {
  if (!result) return null;
  const findings = result.validation ? result.validation.findings : [];
  const info = findings.filter((f) => f.severity === "info");
  return (
    <div className="mt-3 space-y-2">
      {result.inForce && (
        <p style={{ color: T.textMuted }} className="text-[11px]">
          Replacing from {when} onward: {result.inForce.name} (effective {String(result.inForce.effective_from)})
        </p>
      )}
      {result.blocking.map((b, i) => (
        <p key={"b" + i} style={{ color: T.warn }} className="text-[11px] leading-relaxed">
          ✕ {b}
        </p>
      ))}
      {result.warnings.map((w, i) => (
        <p key={"w" + i} style={{ color: T.accent }} className="text-[11px] leading-relaxed">
          ⚠ {w}
        </p>
      ))}
      {result.ok && (
        <p style={{ color: T.good }} className="text-[11px]">
          ✓ Checks passed. {info.length} informational change{info.length === 1 ? "" : "s"}
          {result.validation ? ` · ${result.validation.summary.idsAfter} IDs, ${result.validation.summary.idsLogged} seen in history` : ""}.
          {result.row ? ` Will insert as ${result.row.id}.` : ""}
        </p>
      )}
      {info.length > 0 && (
        <details>
          <summary style={{ color: T.textSecondary }} className="text-[11px] cursor-pointer">
            Show {info.length} informational finding{info.length === 1 ? "" : "s"}
          </summary>
          <div className="mt-1 space-y-0.5">
            {info.map((f, i) => (
              <p key={i} style={{ color: T.textMuted }} className="text-[10px]">
                {f.message}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
