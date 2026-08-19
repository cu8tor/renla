import React from "react";
import { AlertTriangle } from "lucide-react";
import { LIGHT } from "../theme.js";
import { Card, Btn } from "./ui.jsx";
import { StyleTag } from "./StyleTag.jsx";

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Renla crashed:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ ...LIGHT, fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <StyleTag />
        <Card style={{ maxWidth: 520 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--danger-soft)", color: "var(--danger)", display: "flex", alignItems: "center", justifyContent: "center" }}><AlertTriangle size={18} /></span>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, margin: 0 }}>Something went wrong on this screen</h3>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 12px" }}>
            The rest of the app is fine — your data is safe. Go back and try again, and send this message on if it keeps happening:
          </p>
          <pre style={{ background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 9, padding: 12, fontSize: 12, overflowX: "auto", fontFamily: "var(--font-mono)", margin: 0 }}>
{String(this.state.error && this.state.error.message || this.state.error)}
          </pre>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <Btn onClick={() => this.setState({ error: null })}>Go back</Btn>
            <Btn variant="ghost" onClick={() => window.location.reload()}>Reload the page</Btn>
          </div>
        </Card>
      </div>
    );
  }
}

export { ErrorBoundary };
