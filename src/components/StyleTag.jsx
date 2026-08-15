function StyleTag() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*{box-sizing:border-box}
:root{--font-display:'Bricolage Grotesque',system-ui,sans-serif;--font-body:'Hanken Grotesk',system-ui,sans-serif;--font-mono:'JetBrains Mono',ui-monospace,monospace}
body{margin:0}
button{font-family:inherit;cursor:pointer}
input,select,textarea{font-family:inherit}
::selection{background:var(--brand-soft)}
.cp-card{background:var(--card);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-sm)}
.cp-pill{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:600;color:var(--brand);background:var(--brand-soft);padding:5px 11px;border-radius:100px;margin-bottom:20px}
.cp-spin{width:26px;height:26px;border-radius:26px;border:2.5px solid var(--line);border-top-color:var(--brand);margin:0 auto;animation:cpSpin .8s linear infinite}
@keyframes cpSpin{to{transform:rotate(360deg)}}

.cp-login{min-height:100vh;max-width:1040px;margin:0 auto;padding:90px 32px 40px;display:flex;flex-direction:column;justify-content:center;gap:20px;position:relative}
.cp-login-brand{display:flex;align-items:center;gap:10px;position:absolute;top:34px;left:32px}
.cp-login-mark,.cp-brand-mark{width:30px;height:30px;border-radius:9px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.cp-role{display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;text-align:left;transition:all .18s ease;box-shadow:var(--shadow-sm)}
.cp-role:hover{border-color:var(--brand);transform:translateY(-2px);box-shadow:var(--shadow)}
.cp-role-ic{width:38px;height:38px;border-radius:10px;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.cp-theme-toggle-login{position:absolute;top:34px;right:32px;display:flex;align-items:center;gap:7px;background:var(--card);border:1px solid var(--line);color:var(--muted);border-radius:100px;padding:8px 14px;font-size:12.5px;font-weight:600}
.cp-theme-toggle-login:hover{border-color:var(--brand);color:var(--brand)}

.cp-app{display:flex;min-height:100vh}
.cp-sidebar{width:246px;flex:0 0 246px;background:var(--sidebar);display:flex;flex-direction:column;padding:18px 14px;position:sticky;top:0;height:100vh}
.cp-brand{display:flex;align-items:center;gap:10px;color:var(--sidebar-ink);padding:6px 8px 18px}
.cp-nav{display:flex;flex-direction:column;gap:2px;flex:1;overflow-y:auto}
.cp-navitem{display:flex;align-items:center;gap:11px;padding:9px 11px;border:none;background:transparent;color:var(--sidebar-muted);border-radius:9px;font-size:13.5px;font-weight:500;transition:all .15s ease;text-align:left;width:100%}
.cp-navitem:hover{background:var(--sidebar-active);color:var(--sidebar-ink)}
.cp-navitem.active{background:var(--sidebar-active);color:#fff}
.cp-navitem.soon{opacity:.62}
.cp-nav-count{margin-left:auto;background:var(--brand);color:#fff;font-size:10.5px;font-weight:700;min-width:18px;height:18px;border-radius:20px;display:flex;align-items:center;justify-content:center;font-family:var(--font-mono)}
.cp-nav-phase{margin-left:auto;font-size:9.5px;font-weight:700;color:var(--sidebar-muted);background:rgba(255,255,255,.06);padding:2px 6px;border-radius:5px}
.cp-nav-sep{font-size:10px;font-weight:700;color:var(--sidebar-muted);text-transform:uppercase;letter-spacing:.08em;padding:16px 11px 7px}
.cp-side-foot{border-top:1px solid var(--sidebar-line);padding-top:12px;margin-top:8px}
.cp-side-user{display:flex;align-items:center;gap:10px;padding:4px}
.cp-main{flex:1;min-width:0;display:flex;flex-direction:column}
.cp-topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:12px 22px;background:var(--paper);border-bottom:1px solid var(--line)}
.cp-hamburger{display:none;background:var(--card);border:1px solid var(--line);color:var(--ink);border-radius:9px;width:36px;height:36px;align-items:center;justify-content:center}
.cp-search{flex:1;max-width:440px;position:relative;display:flex;align-items:center;gap:9px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:0 12px;height:38px}
.cp-search:focus-within{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-ring)}
.cp-search input{flex:1;border:none;background:transparent;outline:none;color:var(--ink);font-size:13.5px;min-width:0}
.cp-search-clear{background:transparent;border:none;color:var(--muted);display:flex}
.cp-search-panel{position:absolute;top:44px;left:0;right:0;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);padding:6px;z-index:30;max-height:340px;overflow-y:auto}
.cp-sr{width:100%;display:flex;align-items:center;gap:11px;padding:8px 10px;border:none;background:transparent;border-radius:8px;text-align:left}
.cp-sr:hover{background:var(--card2)}
.cp-sr b{display:block;font-size:13px;color:var(--ink)}
.cp-sr small{display:block;font-size:11.5px;color:var(--muted)}
.cp-sr-ic{width:28px;height:28px;border-radius:7px;background:var(--brand-soft);color:var(--brand);display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.cp-icon-btn{width:38px;height:38px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);display:flex;align-items:center;justify-content:center;position:relative;transition:all .15s ease}
.cp-icon-btn:hover{border-color:var(--brand);color:var(--brand)}
.cp-icon-btn.light{border-color:var(--sidebar-line);background:transparent;color:var(--sidebar-muted);width:32px;height:32px}
.cp-icon-btn.light:hover{color:var(--danger);border-color:var(--danger)}
.cp-content{padding:26px 22px 60px;max-width:1180px;width:100%;margin:0 auto}

.cp-tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.cp-two-col{display:grid;grid-template-columns:1.6fr 1fr;gap:18px;align-items:start}
.cp-stat-ic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.cp-doc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}

.cp-table-wrap{overflow-x:auto}
.cp-table{width:100%;border-collapse:collapse}
.cp-table th{text-align:left;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;padding:12px 16px;border-bottom:1px solid var(--line);white-space:nowrap}
.cp-table td{padding:12px 16px;border-bottom:1px solid var(--line);vertical-align:middle}
.cp-table tbody tr:last-child td{border-bottom:none}
.cp-row{transition:background .12s ease}
.cp-row:hover{background:var(--card2);cursor:pointer}

.cp-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;white-space:nowrap}
.cp-btn{display:inline-flex;align-items:center;gap:7px;border-radius:10px;font-weight:600;border:1px solid transparent;transition:all .15s ease;white-space:nowrap}
.cp-btn-md{padding:9px 15px;font-size:13px}
.cp-btn-sm{padding:6px 11px;font-size:12px;border-radius:8px}
.cp-btn-primary{background:var(--brand);color:#fff}
.cp-btn-primary:hover{background:var(--brand-strong)}
.cp-btn-ghost{background:transparent;color:var(--ink);border-color:var(--line)}
.cp-btn-ghost:hover{border-color:var(--muted)}
.cp-link{display:inline-flex;align-items:center;gap:3px;background:transparent;border:none;color:var(--brand);font-size:12.5px;font-weight:600}
.cp-link:hover{text-decoration:underline}
.cp-mini{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink)}
.cp-mini:hover{border-color:var(--brand);color:var(--brand)}
.cp-mini-ok{color:var(--ok);border-color:var(--ok-soft)}
.cp-mini-ok:hover{background:var(--ok-soft)}
.cp-mini-no{color:var(--danger);border-color:var(--danger-soft)}
.cp-mini-no:hover{background:var(--danger-soft);border-color:var(--danger);color:var(--danger)}
.cp-react{display:inline-flex;align-items:center;gap:6px;background:transparent;border:none;font-size:12.5px;font-weight:600}
.cp-download{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:12.5px;font-weight:600;color:var(--brand);background:var(--brand-soft);border:none;border-radius:9px;padding:8px}
.cp-download:hover{background:var(--brand);color:#fff}
.cp-chip{display:inline-flex;align-items:center;gap:6px;background:var(--card2);border:1px solid var(--line);border-radius:100px;padding:5px 6px 5px 12px;font-size:12.5px;font-weight:600}
.cp-chip button{background:transparent;border:none;color:var(--muted);display:flex;padding:2px;border-radius:20px}
.cp-chip button:hover{color:var(--danger);background:var(--danger-soft)}
.cp-chk{width:9px;height:9px;border-radius:9px;display:inline-block;background:var(--line)}
.cp-chk.confirmed{background:var(--ok)}
.cp-chk.missed{background:var(--danger)}
.cp-chk.pending{background:var(--warn)}
.cp-chk.excused{background:var(--muted);opacity:.5}
.cp-thumb{width:44px;height:44px;border-radius:10px;object-fit:cover;border:1px solid var(--line);cursor:pointer;display:block;transition:transform .15s ease}
.cp-zoomshot{width:220px;height:220px;object-fit:cover;border-radius:16px;border:1px solid var(--line)}
.cp-thumb.sm{width:34px;height:34px;border-radius:8px}
.cp-thumb:hover{transform:scale(1.06);border-color:var(--brand)}
.cp-cam{width:100%;max-width:280px;aspect-ratio:1;margin:0 auto;border-radius:16px;overflow:hidden;background:var(--card2);border:1px solid var(--line);display:flex;align-items:center;justify-content:center}
.cp-cam video,.cp-cam img{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
.cp-cam-err{text-align:center;color:var(--muted);padding:20px}
.cp-slip-band{padding:7px 10px;font-size:11px;font-weight:800;letter-spacing:.06em;background:var(--card2);color:var(--muted);border-bottom:1px solid var(--line)}
.cp-slip-band.ok{background:var(--ok-soft);color:var(--ok)}
.cp-slip-band.danger{background:var(--danger-soft);color:var(--danger)}
.cp-slip-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 18px}
.cp-seg{display:flex;background:var(--card2);border:1px solid var(--line);border-radius:9px;padding:2px}
.cp-seg button{border:none;background:transparent;color:var(--muted);font-size:12px;font-weight:600;padding:5px 11px;border-radius:7px}
.cp-seg button.on{background:var(--brand);color:#fff}
@media(max-width:640px){.cp-slip-grid{grid-template-columns:1fr}}
.cp-slip-head{font-size:11.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--line)}
.cp-num{font-family:var(--font-mono);font-size:12.5px;white-space:nowrap;text-align:right}
.cp-table th:not(:first-child):not(:last-child){text-align:right}
.cp-leaverow{display:flex;align-items:center;gap:12px;padding:11px 12px;border:1px solid var(--line);border-radius:11px;background:var(--card2)}
.cp-tabs{display:flex;gap:6px;margin-bottom:18px;border-bottom:1px solid var(--line)}
.cp-tab{background:transparent;border:none;border-bottom:2px solid transparent;padding:9px 14px;font-size:13px;font-weight:600;color:var(--muted);margin-bottom:-1px}
.cp-tab:hover{color:var(--ink)}
.cp-tab.active{color:var(--brand);border-bottom-color:var(--brand)}
.cp-rota td{padding:8px 6px}
.cp-rota th{padding:10px 6px}
.cp-shift{position:relative;background:var(--brand-soft);color:var(--brand);border-radius:8px;padding:5px 6px;margin-bottom:4px;font-size:11.5px;font-weight:600;font-family:var(--font-mono);line-height:1.3}
.cp-shift small{display:block;font-family:var(--font-body);font-weight:500;font-size:10.5px;opacity:.8;margin-top:1px}
.cp-shift button{position:absolute;top:2px;right:2px;background:transparent;border:none;color:var(--brand);opacity:0;display:flex;padding:1px;border-radius:4px}
.cp-shift:hover button{opacity:.85}
.cp-shift button:hover{background:var(--danger-soft);color:var(--danger);opacity:1}
.cp-addshift{width:100%;background:transparent;border:1px dashed var(--line);color:var(--muted);border-radius:7px;padding:3px;display:flex;align-items:center;justify-content:center;opacity:.55}
.cp-addshift:hover{opacity:1;border-color:var(--brand);color:var(--brand);background:var(--brand-soft)}

.cp-drawer-wrap{position:fixed;inset:0;background:rgba(10,18,14,.44);z-index:50;display:flex;justify-content:flex-end;animation:cpFade .2s ease}
.cp-drawer{width:440px;max-width:92vw;height:100%;background:var(--card);border-left:1px solid var(--line);padding:26px 24px;overflow-y:auto;position:relative;animation:cpSlide .26s cubic-bezier(.2,.7,.2,1)}
.cp-drawer-close{position:absolute;top:18px;right:18px;width:32px;height:32px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--muted);display:flex;align-items:center;justify-content:center}

.cp-modal-wrap{position:fixed;inset:0;background:rgba(10,18,14,.44);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px;animation:cpFade .18s ease}
.cp-modal{width:520px;max-width:100%;max-height:90vh;display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:var(--shadow);animation:cpPop .22s cubic-bezier(.2,.7,.2,1)}
.cp-modal.wide{width:720px}
.cp-modal-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid var(--line);flex:0 0 auto}
.cp-modal-body{padding:20px;overflow-y:auto}
.cp-modal-foot{display:flex;justify-content:flex-end;gap:10px;padding:16px 20px;border-top:1px solid var(--line);flex:0 0 auto}
.cp-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.cp-input{width:100%;border:1px solid var(--line);background:var(--card2);border-radius:9px;padding:9px 11px;font-size:13.5px;color:var(--ink);outline:none;transition:all .15s ease}
.cp-input:focus{border-color:var(--brand);box-shadow:0 0 0 3px var(--brand-ring);background:var(--card)}
textarea.cp-input{resize:vertical;line-height:1.5}

.cp-toasts{position:fixed;bottom:22px;right:22px;z-index:80;display:flex;flex-direction:column;gap:10px}
.cp-toast{display:flex;align-items:center;gap:11px;background:var(--card);border:1px solid var(--line);border-left:3px solid var(--brand);border-radius:11px;padding:11px 15px;font-size:13px;font-weight:500;box-shadow:var(--shadow);min-width:220px;animation:cpToast .28s cubic-bezier(.2,.7,.2,1)}
.cp-toast-ic{width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex:0 0 auto}

.cp-scrim{display:none}
@keyframes cpFade{from{opacity:0}to{opacity:1}}
@keyframes cpSlide{from{transform:translateX(24px);opacity:.6}to{transform:translateX(0);opacity:1}}
@keyframes cpPop{from{transform:scale(.97) translateY(6px);opacity:0}to{transform:scale(1) translateY(0);opacity:1}}
@keyframes cpToast{from{transform:translateX(30px);opacity:0}to{transform:translateX(0);opacity:1}}
.cp-fade{animation:cpFade .26s ease}

@media(max-width:1080px){.cp-two-col{grid-template-columns:1fr}.cp-tiles{grid-template-columns:repeat(2,1fr)}}
@media(max-width:900px){
  .cp-sidebar{position:fixed;left:0;top:0;z-index:60;transform:translateX(-100%);transition:transform .26s cubic-bezier(.2,.7,.2,1);box-shadow:var(--shadow)}
  .cp-sidebar.open{transform:translateX(0)}
  .cp-scrim{display:block;position:fixed;inset:0;background:rgba(10,18,14,.44);z-index:55}
  .cp-hamburger{display:flex}
}
@media(max-width:560px){.cp-tiles{grid-template-columns:1fr}.cp-form-grid{grid-template-columns:1fr}.cp-content{padding:20px 16px 50px}.cp-topbar{padding:10px 14px}.cp-login{padding:80px 20px 40px}}
@media(prefers-reduced-motion:reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
`}</style>
  );
}

export { StyleTag };
