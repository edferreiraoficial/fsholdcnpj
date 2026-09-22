import axios from 'axios';

const defaultApiUrl =
  window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3333'
    : 'https://api.fshold.com.br';

export const API_URL = import.meta.env.VITE_API_URL || defaultApiUrl;
export const api = axios.create({ baseURL: API_URL });
