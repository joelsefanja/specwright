import React from "react";
import TemplatePanel from "./TemplatePanel";
import TerminalPanel from "./TerminalPanel";

export default function RightPanel(): React.JSX.Element {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Templates: top half */}
      <div className="flex-1 min-h-0 border-b border-operator-line">
        <TemplatePanel />
      </div>
      {/* Terminal: bottom half */}
      <div className="flex-1 min-h-0">
        <TerminalPanel />
      </div>
    </div>
  );
}
