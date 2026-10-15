import { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../../supabase";
import logos from "../../assets/icons/logos.svg";
import { Home, FileText, CalendarDays, Settings, LogOut, Menu, Plus } from "lucide-react";
import "./Layout.css";

const Layout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [userProfile, setUserProfile] = useState({ email: '', name: '', avatar: '' });
  const navigate = useNavigate();

  useEffect(() => {
    const getLoggedUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserProfile({
          email: user.email || '',
          name: user.user_metadata?.full_name || '',
          avatar: user.user_metadata?.avatar_url || ''
        });
      }
    };
    getLoggedUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUserProfile({
          email: session.user.email || '',
          name: session.user.user_metadata?.full_name || '',
          avatar: session.user.user_metadata?.avatar_url || ''
        });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const navItems = [
    { to: "/dashboard", icon: <Home size={20} />, label: "Dashboard" },
    { to: "/lista-os", icon: <FileText size={20} />, label: "Ordens de Serviço" },
    { to: "/pagamentos", icon: <CalendarDays size={20} />, label: "Pagamentos" },
    { to: "/configuracoes", icon: <Settings size={20} />, label: "Configurações" }
  ];

  return (
    <div className="layout-wrapper">
      {isSidebarOpen && <div className="sidebar-mobile-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      <aside className={`sidebar ${!isSidebarOpen ? "closed" : ""}`}>
        <div className="sidebar-logos">
          <img src={logos} alt="Sebrae" className="logos" />
        </div>
        
        <div className="sidebar-menu">
          {isSidebarOpen && <h3 className="menu-title">Acesso rápido</h3>}

          <nav style={{marginTop: '15px'}}>
            {navItems.map(item => (
              <NavLink 
                key={item.to} 
                to={item.to} 
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={() => window.innerWidth <= 768 && setIsSidebarOpen(false)}
              >
                {item.icon}
                {isSidebarOpen && <span>{item.label}</span>}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <a onClick={handleLogout} className="logout-btn">
            <LogOut size={20} />
            {isSidebarOpen && <span>Sair do sistema</span>}
          </a>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button className="hamburger-menu" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
              <Menu size={24} />
            </button>
          </div>
          
          <div className="header-actions">
            <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '14px' }} onClick={() => navigate('/os-form')}>
              <Plus size={16} /> Nova OS
            </button>
            <div 
              className="user-profile" 
              onClick={() => navigate('/configuracoes')} 
              style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
              title="Ir para Minha Conta"
            >
              {userProfile.name && (
                <span className="user-name-header" style={{ fontSize: 13, fontWeight: 500, color: '#334155' }}>
                  {userProfile.name}
                </span>
              )}
              <div className="avatar" style={{ overflow: 'hidden' }}>
                {userProfile.avatar ? (
                  <img src={userProfile.avatar} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  (userProfile.name ? userProfile.name.charAt(0) : (userProfile.email ? userProfile.email.charAt(0) : 'U')).toUpperCase()
                )}
              </div>
            </div>
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
