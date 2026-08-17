import { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import home from '../../assets/icons/home.svg';
import listOS from '../../assets/icons/listOS.svg';
import search from '../../assets/icons/search.svg';
import logos from '../../assets/icons/logos.svg';
import { createClient } from '@supabase/supabase-js';
import './Layout.css';

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [searchTerm, setSearchTerm] = useState(''); 
    // 1. Novo estado para armazenar o email do usuário logado
    const [userEmail, setUserEmail] = useState(''); 
    
    const navigate = useNavigate();
    const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

    // 2. Busca os dados do usuário autenticado assim que o Layout é montado
    useEffect(() => {
        const getLoggedUser = async () => {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (user) {
                setUserEmail(user.email);
            } else if (error) {
                console.error("Erro ao buscar usuário logado:", error.message);
            }
        };
        
        getLoggedUser();
    }, []); // Array vazio garante que rode apenas uma vez ao renderizar

    const handleLogout = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            navigate("/");
        } catch (error) {
            console.error(error);
            alert("Erro ao fazer logout.");
        }
    };

    const toggleSidebar = () => {
        setIsSidebarOpen(!isSidebarOpen);
    };

    const handleSearch = () => {
        if (searchTerm.trim()) {
            navigate(`/os-form?id=${searchTerm.trim()}`);
            setSearchTerm(''); 
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    return (
        <div className="layout-wrapper">
            <aside className={`sidebar ${!isSidebarOpen ? 'closed' : ''}`}>
                <div className="sidebar-logos">
                    <img src={logos} alt="logos" className="logos" />
                </div>
                <div className="sidebar-menu">
                    {isSidebarOpen && <h3 className="menu-title">Acesso rápido</h3>}
                    
                    <div className="search-bar">
                        <span onClick={handleSearch} style={{ cursor: 'pointer' }}>
                            <img src={search} alt="Pesquisar" className="search-icon" />
                        </span>
                        
                        {isSidebarOpen && (
                            <input 
                                type="text" 
                                placeholder="Pesquisar OS..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                        )}
                    </div>
                    
                    <nav>
                        <a href="/dashboard" className="nav-item">
                            <span><img src={home} alt="Home" className="nav-icon" /></span> {isSidebarOpen && "Home"}
                        </a>
                        <a href="/lista-os" className="nav-item">
                            <span><img src={listOS} alt="Lista de OS" className="nav-icon" /></span> {isSidebarOpen && "Lista de OS"}
                        </a>
                    </nav>
                </div>
                <div className="sidebar-footer">
                    <a onClick={handleLogout} className="logout-btn" style={{ cursor: 'pointer' }}>
                        <span>⏻</span> {isSidebarOpen && "Logout"}
                    </a>
                </div>
            </aside>

            <main className="main-content">
                <header className="top-header">
                    <button className="hamburger-menu" onClick={toggleSidebar}>☰</button>
                    <div className="user-profile">
                        {/* 3. A palavra "Karina" substituída pela chamada dinâmica do estado */}
                        <span className="user-name">{userEmail || 'Carregando...'}</span>
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