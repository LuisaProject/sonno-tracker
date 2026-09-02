import { SUPABASE_URL, SUPABASE_ANON_KEY } from './src/config.js';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentProfile = null;

const el = {
  loginScreen: document.getElementById('login-screen'),
  profiloScreen: document.getElementById('profilo-screen'),
  trackingScreen: document.getElementById('tracking-screen'),
  loginForm: document.getElementById('login-form'),
  loginError: document.getElementById('login-error'),
  profiloForm: document.getElementById('profilo-form'),
};

function mostraSchermata(nome) {
  el.loginScreen.hidden = nome !== 'login';
  el.profiloScreen.hidden = nome !== 'profilo';
  el.trackingScreen.hidden = nome !== 'tracking';
}

async function init() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    mostraSchermata('login');
    return;
  }
  currentUser = session.user;
  await dopoLogin();
}

async function dopoLogin() {
  const { data: profile } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .maybeSingle();

  if (!profile) {
    mostraSchermata('profilo');
    return;
  }
  currentProfile = profile;
  mostraSchermata('tracking');
}

el.loginForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    el.loginError.textContent = error.message;
    el.loginError.hidden = false;
    return;
  }
  currentUser = data.user;
  await dopoLogin();
});

el.profiloForm.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const nome = document.getElementById('profilo-nome').value;
  const eta = parseInt(document.getElementById('profilo-eta').value, 10);
  const { data, error } = await supabaseClient
    .from('profiles')
    .insert({ id: currentUser.id, nome, eta })
    .select()
    .single();
  if (error) {
    alert(error.message);
    return;
  }
  currentProfile = data;
  mostraSchermata('tracking');
});

init();
