import { useState } from 'react';
import { useNavigate } from "react-router-dom";
import sebrae from '../../assets/img/sebrae.svg';
import blue from '../../assets/img/blue.svg';
import { createClient } from '@supabase/supabase-js';
// import ilustracao from '../../assets/img/Group77.svg';
import './Login.css';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const navigate = useNavigate();

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const handleLogin = async (e) => {
        e.preventDefault();
        e.preventDefault();

        if (!email || !password) {
            alert("Por favor, preencha todos os campos.");
            return;
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) throw error;

            navigate("/dashboard");
        } catch (error) {
            console.error(error);
            alert("Erro ao fazer login: " + error.message);
        }
    };

    return (
        <div className="login-container">
            <div className="login-left">
                <div className="login-left-content">
                    <h2>Sistema dedicado a gestão das demandas do SEBRAE</h2>
                    <p>Para não ter que usar aquela planilha complicadíssima, desenvolvi isso para ajudar</p>
                    <div className="logos-area">
                        <img src={sebrae} alt="sebrae" className="logo" />
                        <img src={blue} alt="hel" className="logo" />
                        {/* <img src={ilustracao} alt="ilustracao" className="logo" /> */}
                    </div>
                </div>
            </div>

            <div className="login-right">
                <div className="login-card">
                    <p className="welcome-text">Bem vindo(a) <span>ao sistema do Vini</span></p>
                    <h1 className="login-title">Login</h1>

                    <form onSubmit={handleLogin}>
                        <div className="input-group">
                            <label>Insira seu email</label>
                            <input
                                type="email"
                                placeholder="email@gmail.com.br"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>

                        <div className="input-group">
                            <label>Insira sua senha</label>
                            <input
                                type="password"
                                placeholder="Senha"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <div className="forgot-password">
                            <a href="#">Esqueci a senha</a>
                        </div>

                        <button type="submit" className="login-btn">Entrar</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;