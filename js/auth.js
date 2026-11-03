// ==================== SESIÓN ====================
// Una sola cuenta ADMI para todas las apps. Esta app además exige tener
// acceso a 'finanzas' en public.app_access (lo otorga el administrador).

const Auth = {
    user: null,
    _mode: 'login', // 'login' | 'signup'

    // Resuelve cuando hay un usuario con sesión y acceso a la app.
    async requireUser() {
        const { data: { session } } = await sb.auth.getSession();
        if (session && await this._hasAccess()) {
            this.user = session.user;
            this._showApp();
            return this.user;
        }
        return new Promise(resolve => this._showLogin(session ? 'noaccess' : 'login', resolve));
    },

    async signOut() {
        await sb.auth.signOut();
        location.reload();
    },

    async _hasAccess() {
        const { data, error } = await sb.from('app_access')
            .select('app_slug').eq('app_slug', APP_SLUG).maybeSingle();
        return !error && !!data;
    },

    _showApp() {
        document.body.classList.remove('auth-pending');
        document.getElementById('authScreen').classList.remove('active');
        document.getElementById('userEmail').textContent = this.user.email;
    },

    _showLogin(state, resolve) {
        document.getElementById('authScreen').classList.add('active');
        this._render(state);

        document.getElementById('authToggle').onclick = () =>
            this._render(this._mode === 'login' ? 'signup' : 'login');
        document.getElementById('authSignOut').onclick = () => this.signOut();

        document.getElementById('authForm').onsubmit = async e => {
            e.preventDefault();
            const email = document.getElementById('authEmail').value.trim();
            const password = document.getElementById('authPassword').value;
            const btn = document.getElementById('authSubmit');
            btn.disabled = true;
            this._msg('');

            try {
                if (this._mode === 'signup') {
                    const name = document.getElementById('authName').value.trim();
                    const { data, error } = await sb.auth.signUp({
                        email, password,
                        options: { data: { display_name: name }, emailRedirectTo: location.href.split('#')[0] }
                    });
                    if (error) throw error;
                    if (!data.session) {
                        this._render('login');
                        this._msg('Te enviamos un correo para confirmar tu cuenta. Confírmala y vuelve a entrar.', 'ok');
                        return;
                    }
                } else {
                    const { error } = await sb.auth.signInWithPassword({ email, password });
                    if (error) throw error;
                }

                if (!await this._hasAccess()) { this._render('noaccess'); return; }
                const { data: { user } } = await sb.auth.getUser();
                this.user = user;
                this._showApp();
                resolve(user);
            } catch (err) {
                this._msg(this._errorText(err), 'error');
            } finally {
                btn.disabled = false;
            }
        };
    },

    _render(state) {
        const isNoAccess = state === 'noaccess';
        if (!isNoAccess) this._mode = state;
        const signup = this._mode === 'signup';

        document.getElementById('authForm').hidden = isNoAccess;
        document.getElementById('authNoAccess').hidden = !isNoAccess;
        document.getElementById('authNameGroup').hidden = !signup;
        document.getElementById('authName').required = signup;
        document.getElementById('authPassword').autocomplete = signup ? 'new-password' : 'current-password';
        document.getElementById('authSubmit').textContent = signup ? 'Crear cuenta' : 'Entrar';
        document.getElementById('authToggle').textContent = signup
            ? '¿Ya tienes cuenta? Inicia sesión'
            : '¿No tienes cuenta? Regístrate';
        this._msg('');
    },

    _msg(text, type = '') {
        const el = document.getElementById('authMsg');
        el.textContent = text;
        el.className = `auth-msg ${type}`;
    },

    _errorText(err) {
        const m = (err && err.message) || '';
        if (/invalid login credentials/i.test(m)) return 'Correo o contraseña incorrectos.';
        if (/email not confirmed/i.test(m)) return 'Primero confirma tu correo (revisa tu bandeja de entrada).';
        if (/already registered/i.test(m)) return 'Ese correo ya tiene una cuenta. Inicia sesión.';
        if (/password should be at least/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
        if (/rate limit/i.test(m)) return 'Demasiados intentos. Espera un momento y vuelve a probar.';
        return m || 'No se pudo completar. Revisa tu conexión.';
    }
};
