
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

console.log("index.tsx: Script loading...");

// Global error handler for early crashes
window.onerror = function(message, source, lineno, colno, error) {
  console.error("Global Error caught:", { message, source, lineno, colno, error });
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `
      <div style="padding: 40px; color: #ef4444; font-family: sans-serif; background: #0f172a; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
        <h1 style="font-size: 24px; font-weight: 900; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.1em;">Lỗi Hệ Thống Nghiêm Trọng</h1>
        <p style="color: #94a3b8; max-width: 500px; margin-bottom: 24px; line-height: 1.6;">Ứng dụng không thể khởi tạo. Vui lòng kiểm tra kết nối mạng hoặc cấu hình biến môi trường trên Vercel.</p>
        <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 12px; font-family: monospace; font-size: 12px; text-align: left; border: 1px solid rgba(239, 68, 68, 0.2); color: #fca5a5; overflow: auto; max-width: 90vw; white-space: pre-wrap;">
          ${message}
          ${error?.stack ? '\n\nStack Trace:\n' + error.stack : ''}
        </div>
        <button onclick="window.location.reload()" style="margin-top: 32px; padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">Tải lại trang</button>
      </div>
    `;
  }
};

console.log("index.tsx: Initializing React root...");

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', fontFamily: 'sans-serif' }}>
          <h1>Something went wrong.</h1>
          <pre>{this.state.error?.toString()}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

try {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
} catch (e: any) {
  console.error("Failed to render root:", e);
  if (window.onerror) {
    window.onerror(e.message || "Root render failed", "", 0, 0, e);
  }
}
