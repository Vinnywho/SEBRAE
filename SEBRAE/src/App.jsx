import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login/Login";
import Layout from "./components/Layout/Layout";
import Dashboard from "./pages/Dashboard/Dashboard";
import OSForm from "./pages/OSForm/OSForm";
import ListaOS from "./pages/ListaOS/ListaOS";
import ListaResponsaveis from './pages/ListaResponsaveis/ListaResponsaveis';
import Configuracoes from "./pages/Configuracoes/Configuracoes";
import ProtectedRoute from "./ProtectedRoute.jsx";
import { ConfigProvider } from "./context/ConfigContext";
import { ToastProvider } from "./context/ToastContext";

function App() {
  return (
    <ToastProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Login />} />
          
          <Route element={
            <ProtectedRoute>
              <ConfigProvider>
                <Layout />
              </ConfigProvider>
            </ProtectedRoute>
          }>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/os-form" element={<OSForm />} />
            <Route path="/lista-os" element={<ListaOS />} />
            <Route path="/pagamentos" element={<ListaResponsaveis />} />
            <Route path="/configuracoes" element={<Configuracoes />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </Router>
    </ToastProvider>
  );
}

export default App;
