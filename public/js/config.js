/* ==========================================================================
   Control de Gastos — config.js
   Configuración fija: URL del backend, estados, colores e íconos de categorías, nombres de meses y días.
   ========================================================================== */

// ---- Configuración: URL del Web App y clave de acceso ----
const API_BASE = 'https://script.google.com/macros/s/AKfycby7o0ep6JAQx42fYDPzUYyUlUigT_yZH-jdqGiFm9idxWXItob3R6E1IipbZTcygxlU/exec';

const ESTADOS = {
  PENDIENTE: 'pendiente de revisar',
  AUTO: 'auto - sin confirmar',
  CONFIRMADO: 'confirmado'
};

const CATEGORY_COLORS = {
  'Transferencias': '#6ea8ff',
  'Supermercado': '#5ee6c5',
  'Restaurante': '#ffb86e',
  'Comida': '#ffb86e',
  'Delivery': '#ff9f6e',
  'Streaming': '#c48cff',
  'Suscripciones': '#c48cff',
  'Transporte': '#ff8e8e',
  'Salud': '#8effc1',
  'Servicios': '#ffe08e',
  'Alcohol/Bebidas': '#ff6ec7',
  'Bebidas alcohólicas': '#ff6ec7',
  'Educación': '#7fd4ff',
  'Ropa': '#ffd27f',
  'Hogar': '#a8e6a1',
  'Otros': '#9aa4b2',
  'Fintual': '#7fa8ff',
  'Pichangas': '#8de08a',
  'Estacionamientos': '#e0c168',
  'Compras online': '#ff9ecf'
};

const CATEGORY_ICONS = {
  'Transferencias': '💸',
  'Supermercado': '🛒',
  'Restaurante': '🍽️',
  'Comida': '🍽️',
  'Delivery': '🛵',
  'Streaming': '📺',
  'Suscripciones': '📺',
  'Transporte': '🚗',
  'Salud': '⚕️',
  'Servicios': '🧾',
  'Alcohol/Bebidas': '🍷',
  'Bebidas alcohólicas': '🍷',
  'Educación': '🎓',
  'Ropa': '👕',
  'Hogar': '🏠',
  'Otros': '📦',
  'Fintual': '📈',
  'Pichangas': '⚽',
  'Estacionamientos': '🅿️',
  'Compras online': '🛍️'
};

const DEFAULT_ICON = '🏷️';

const NO_CATEGORY_ICON = '❔';

// Valor del filtro de Vista Gastos para gastos sin categoría (no choca con
// ningún nombre real de categoría).
const NO_CATEGORY_FILTER = '__sin_categoria__';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Indexado igual que Date.getDay(): 0 = Domingo ... 6 = Sábado.
const DIAS_SEMANA = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// Paleta rápida de emojis para elegir ícono de categoría en Configuración.
// El usuario también puede escribir/pegar cualquier otro emoji a mano.
const ICON_PALETTE = [
  '🛒','🍽️','🛵','📺','🚗','⚕️','🧾','🍷','🎓','👕',
  '🏠','📦','📈','⚽','🅿️','🛍️','💰','💳','🎬','🎮',
  '📱','✈️','🐾','🎁','📚','☕','🍺','🏋️','🚌','🎵'
];
