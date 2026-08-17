import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/Login/Login';
import Layout from './components/Layout/Layout';
import Dashboard from './pages/Dashboard/Dashboard';
import OSForm from './pages/OSForm/OSForm';
import ListaOS from './pages/ListaOS/ListaOS';
import ProtectedRoute from "./ProtectedRoute.jsx";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route element={<Layout />}>
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>}
          />
          <Route
            path="/os-form"
            element={
              <ProtectedRoute>
                <OSForm />
              </ProtectedRoute>}
          />
          <Route
            path="/lista-os"
            element={
              <ProtectedRoute>
                <ListaOS />
              </ProtectedRoute>}
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;

