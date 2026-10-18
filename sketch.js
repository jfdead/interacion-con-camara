// ------------------------------------------------------------
// Interacción con cámara — p5.js + ml5.js Handpose
// Especificaciones: SPEC.md
//
// - Cámara a pantalla completa (100% del ancho y alto)
// - Gesto de pistola (índice + pulgar en L, resto cerrado) con los 21 landmarks
// - El círculo nace en la mano, viaja en la dirección del índice y se desvanece
// - Sin audio y sin efectos adicionales
// - Librerías por CDN (ver index.html)
// ------------------------------------------------------------

// --- Ajustes de rendimiento ---------------------------------
// El modelo se ejecuta sobre un frame reducido y con una cadencia adaptativa:
// si una inferencia tarda mucho (por ejemplo, sin WebGL y con backend CPU),
// se espacia para no bloquear el hilo principal y congelar la cámara.
const ANCHO_DETECCION_WEBGL = 640;
const ANCHO_DETECCION_CPU = 320;
const MS_MIN_ENTRE_DETECCIONES = 50;
// Sin tope bajo: en CPU una inferencia puede tardar segundos y, si se encola
// sin pausa, la cámara queda congelada. Es preferible detectar más espaciado.
const MS_MAX_ENTRE_DETECCIONES = 8000;
const CARGA_INFERENCIA = 0.35; // fracción máxima del tiempo ocupada por inferencia

// --- Ajustes del disparo ------------------------------------
const VELOCIDAD_DISPARO = 720; // px por segundo
const DURACION_DISPARO_MS = 1100; // vida total del círculo
const MS_ENTRE_DISPAROS = 130;
const RADIO_DISPARO = 15;

// --- Estado -------------------------------------------------
let video;
let handpose;
let estadoModelo = 'cargando'; // 'cargando' | 'listo' | 'error'
let manos = [];
let disparos = [];
let debug = false;

// Frame reducido que se entrega al modelo
let lienzoDeteccion;
let ctxDeteccion;
let anchoMaxDeteccion = ANCHO_DETECCION_WEBGL;
let hayWebGL = true;

// Medición de la inferencia para adaptar la cadencia
let detectando = false;
let ultimaDeteccion = 0;
let msEntreDetecciones = 0;
let duracionInferencia = 0;
let ultimoDisparo = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  // La cámara ya cubre la pantalla: no hace falta renderizar al doble por DPR.
  pixelDensity(1);
  // 30 fps alcanzan para una cámara y reducen a la mitad el trabajo de dibujo.
  frameRate(30);

  hayWebGL = detectarWebGL();
  anchoMaxDeteccion = hayWebGL ? ANCHO_DETECCION_WEBGL : ANCHO_DETECCION_CPU;

  // Cámara a pantalla completa, a una resolución razonable (no la máxima del
  // dispositivo): menos decodificación y menos escalado por frame.
  video = createCapture({
    video: {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    },
    audio: false,
  });
  video.hide();

  lienzoDeteccion = document.createElement('canvas');
  // tfjs lee este canvas con getImageData en el backend CPU.
  ctxDeteccion = lienzoDeteccion.getContext('2d', { willReadFrequently: true });

  // Se crea SIN video para que ml5 no lance su propio bucle de inferencia:
  // nosotros decidimos cuándo y sobre qué frame se ejecuta (ver detectarManos).
  handpose = ml5.handpose({ flipHorizontal: false }, (error) => {
    if (error) {
      estadoModelo = 'error';
      console.error('No se pudo cargar el modelo Handpose:', error);
      return;
    }
    estadoModelo = 'listo';
  });
  // Evita un rechazo sin manejar si falla la carga (el callback ya lo informa).
  handpose.ready.catch(() => {});

  textSize(16);
  textAlign(LEFT, TOP);
  textFont('monospace');
}

/**
 * WebGL es lo que hace usable a Handpose. Sin WebGL, tfjs cae al backend CPU:
 * conviene detectarlo para bajar resolución y frecuencia de inferencia.
 */
function detectarWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return false;
    const perder = gl.getExtension('WEBGL_lose_context');
    if (perder) perder.loseContext();
    return true;
  } catch (error) {
    return false;
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function keyPressed() {
  if (key === 'd' || key === 'D') debug = !debug;
}

function draw() {
  // deltaTime llega en ms; se acota para que un bloqueo largo no teletransporte
  // los círculos.
  const dt = Math.min(deltaTime, 100);

  if (video && video.elt && video.elt.readyState >= 2) {
    // Camino mínimo: sin capas intermedias de p5, estirado al 100% del canvas.
    drawingContext.drawImage(
      video.elt,
      0,
      0,
      drawingContext.canvas.width,
      drawingContext.canvas.height
    );
  } else {
    background(0);
  }

  detectarManos();

  let analisis = null;
  if (manos.length > 0) analisis = analizarMano(manos[0]);
  if (analisis) dispararSiCorresponde(analisis);

  actualizarDisparos(dt);
  dibujarInfo();
  if (debug) dibujarDebug(analisis);
}

/**
 * Ejecuta la inferencia sin solapar llamadas y sobre un frame reducido.
 * El intervalo se adapta a la duración real: en CPU una inferencia puede
 * tardar cientos de ms y, sin pausa, dejaría la cámara congelada.
 */
function detectarManos() {
  if (estadoModelo !== 'listo' || !handpose.model || detectando) return;

  const ahora = performance.now();
  if (ahora - ultimaDeteccion < intervaloDeteccion()) return;

  const el = video && video.elt;
  if (!el || el.readyState < 2 || !el.videoWidth) return;

  const escala = Math.min(1, anchoMaxDeteccion / el.videoWidth);
  const ancho = Math.round(el.videoWidth * escala);
  const alto = Math.round(el.videoHeight * escala);

  if (lienzoDeteccion.width !== ancho || lienzoDeteccion.height !== alto) {
    lienzoDeteccion.width = ancho;
    lienzoDeteccion.height = alto;
  }
  ctxDeteccion.drawImage(el, 0, 0, ancho, alto);

  if (ultimaDeteccion > 0) {
    const delta = ahora - ultimaDeteccion;
    msEntreDetecciones =
      msEntreDetecciones === 0 ? delta : msEntreDetecciones * 0.7 + delta * 0.3;
  }
  ultimaDeteccion = ahora;
  detectando = true;

  const inicio = ahora;
  handpose
    .predict(lienzoDeteccion)
    .then((resultado) => {
      manos = resultado || [];
    })
    .catch((error) => {
      // Sin predicción no hay mano: evita disparos fantasma con datos viejos.
      manos = [];
      console.warn('Error en la detección de manos:', error);
    })
    .finally(() => {
      const duracion = performance.now() - inicio;
      duracionInferencia =
        duracionInferencia === 0
          ? duracion
          : duracionInferencia * 0.7 + duracion * 0.3;
      detectando = false;
    });
}

/** Intervalo necesario para que la inferencia no ocupe más de CARGA_INFERENCIA. */
function intervaloDeteccion() {
  if (duracionInferencia <= 0) return MS_MIN_ENTRE_DETECCIONES;
  // intervalo = duración / carga => la inferencia ocupa como máximo esa carga
  const objetivo = duracionInferencia / CARGA_INFERENCIA;
  return Math.min(
    MS_MAX_ENTRE_DETECCIONES,
    Math.max(MS_MIN_ENTRE_DETECCIONES, objetivo)
  );
}

/**
 * Convierte los 21 landmarks (píxeles del lienzo de detección) al espacio del
 * canvas visible y evalúa qué dedos están extendidos.
 */
function analizarMano(mano) {
  const landmarks = mano && mano.landmarks;
  if (!landmarks || landmarks.length < 21) return null;
  if (!lienzoDeteccion || !lienzoDeteccion.width) return null;

  // Las mediciones se hacen en el lienzo de detección (sin distorsión por
  // aspecto). Solo se escala para dibujar y para calcular la dirección en
  // pantalla.
  const punto = (i) => {
    const lm = landmarks[i];
    // ml5 0.12 devuelve [x, y, z]; se toleran objetos por compatibilidad.
    const x = Array.isArray(lm) ? lm[0] : lm.x;
    const y = Array.isArray(lm) ? lm[1] : lm.y;
    return { x, y };
  };

  const aCanvas = (p) => ({
    x: (p.x * width) / lienzoDeteccion.width,
    y: (p.y * height) / lienzoDeteccion.height,
  });

  const carpo = punto(0);
  const distanciaAlCarpo = (i) => {
    const p = punto(i);
    return Math.hypot(p.x - carpo.x, p.y - carpo.y);
  };

  // Un dedo está extendido cuando su punta se aleja del carpo bastante más
  // que su articulación intermedia (PIP). Es independiente de la orientación.
  const extendido = (punta, pip) =>
    distanciaAlCarpo(punta) > distanciaAlCarpo(pip) * 1.1;

  const indice = extendido(8, 6);
  const medio = extendido(12, 10);
  const anular = extendido(16, 14);
  const menique = extendido(20, 18);

  // El pulgar debe formar una L con el índice (no plegado sobre la palma).
  const baseIndice = punto(5);
  const puntaIndice = punto(8);
  const angulo = anguloEntre(
    { x: punto(4).x - baseIndice.x, y: punto(4).y - baseIndice.y },
    { x: puntaIndice.x - baseIndice.x, y: puntaIndice.y - baseIndice.y }
  );
  const pulgar =
    angulo > 30 &&
    angulo < 150 &&
    distanciaAlCarpo(4) > distanciaAlCarpo(3) * 1.05;

  return {
    punto: (i) => aCanvas(punto(i)),
    baseIndice: aCanvas(baseIndice),
    puntaIndice: aCanvas(puntaIndice),
    dedos: { indice, pulgar, medio, anular, menique },
    pistola: indice && pulgar && !medio && !anular && !menique,
  };
}

function anguloEntre(a, b) {
  const magA = Math.hypot(a.x, a.y);
  const magB = Math.hypot(b.x, b.y);
  if (magA === 0 || magB === 0) return 0;
  const cos = (a.x * b.x + a.y * b.y) / (magA * magB);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/**
 * Dispara con el gesto de pistola. El círculo nace en la base del índice
 * (posición de la mano) y sigue la dirección en la que apunta la punta.
 */
function dispararSiCorresponde(analisis) {
  if (!analisis.pistola) return;

  const ahora = performance.now();
  if (ahora - ultimoDisparo < MS_ENTRE_DISPAROS) return;

  const direccion = createVector(
    analisis.puntaIndice.x - analisis.baseIndice.x,
    analisis.puntaIndice.y - analisis.baseIndice.y
  );
  // Índice apuntando hacia la cámara: no hay dirección en pantalla.
  if (direccion.magSq() < 1) return;

  disparos.push(
    new CirculoDisparo(analisis.baseIndice.x, analisis.baseIndice.y, direccion)
  );
  ultimoDisparo = ahora;
}

function actualizarDisparos(dt) {
  for (let i = disparos.length - 1; i >= 0; i--) {
    const disparo = disparos[i];
    disparo.update(dt);
    if (disparo.estaMuerto() || disparo.estaFuera()) {
      disparos.splice(i, 1);
      continue;
    }
    disparo.display();
  }
}

function dibujarInfo() {
  textSize(16);
  noStroke();
  fill(255);
  text('Gesto: índice + pulgar (pistola) = dispara un círculo', 20, 20);
  text('Presioná D para ver el diagnóstico', 20, 40);

  if (estadoModelo === 'cargando') {
    fill(255, 220, 0);
    text('Cargando modelo de manos…', 20, 60);
  } else if (estadoModelo === 'error') {
    fill(255, 80, 80);
    text('No se pudo cargar el modelo. Revisá la conexión.', 20, 60);
  } else if (duracionInferencia > 600) {
    fill(255, 200, 0);
    text(
      hayWebGL
        ? 'Detección lenta: la cámara puede entrecortarse'
        : 'Sin WebGL: detección lenta (activá la aceleración por hardware)',
      20,
      60
    );
  }
}

/**
 * Panel de diagnóstico (tecla D): visible siempre que esté activado, para que
 * se note aunque todavía no haya una mano detectada.
 */
function dibujarDebug(analisis) {
  // Landmarks y sus índices, si hay mano
  if (analisis) {
    noStroke();
    for (let i = 0; i < 21; i++) {
      const p = analisis.punto(i);
      fill(0, 255, 0);
      circle(p.x, p.y, 6);
      fill(255);
      textSize(10);
      text(i, p.x + 8, p.y - 4);
    }
  }

  const tasa = msEntreDetecciones > 0 ? 1000 / msEntreDetecciones : 0;
  const lineas = [
    'DEBUG · D para cerrar',
    'WebGL: ' +
      (hayWebGL ? 'sí' : 'NO — Handpose corre en CPU (más lento)') +
      ' · Detección: ' +
      (lienzoDeteccion ? lienzoDeteccion.width + 'x' + lienzoDeteccion.height : '—'),
    'Inferencia: ' +
      Math.round(duracionInferencia) +
      ' ms · cada ' +
      Math.round(intervaloDeteccion()) +
      ' ms' +
      (tasa > 0 ? ' · ' + tasa.toFixed(1) + ' Hz' : ''),
    'Estado: ' +
      estadoModelo +
      ' · Manos: ' +
      manos.length +
      ' · FPS: ' +
      Math.round(frameRate()),
  ];

  if (analisis) {
    lineas.push(
      'Índice ' +
        (analisis.dedos.indice ? 'EXTENDIDO' : 'doblado') +
        ' · Pulgar ' +
        (analisis.dedos.pulgar ? 'EXTENDIDO' : 'doblado')
    );
    lineas.push(
      'Medio ' +
        (analisis.dedos.medio ? 'EXTENDIDO' : 'doblado') +
        ' · Anular ' +
        (analisis.dedos.anular ? 'EXTENDIDO' : 'doblado') +
        ' · Meñique ' +
        (analisis.dedos.menique ? 'EXTENDIDO' : 'doblado')
    );
  }

  const ancho = Math.min(640, width - 20);
  const alto = lineas.length * 18 + 12;
  const y = height - alto - 10;

  noStroke();
  fill(0, 0, 0, 175);
  rect(10, y, ancho, alto, 6);

  textSize(13);
  fill(255);
  for (let i = 0; i < lineas.length; i++) {
    text(lineas[i], 20, y + 6 + i * 18);
  }
}

// ------------------------------------------------------------
// Círculo que viaja y se desvanece
// ------------------------------------------------------------
class CirculoDisparo {
  constructor(x, y, direccion) {
    this.pos = createVector(x, y);
    this.vel = direccion.copy().normalize().mult(VELOCIDAD_DISPARO);
    this.radio = RADIO_DISPARO;
    this.edad = 0;
  }

  update(dtMs) {
    const segundos = dtMs / 1000;
    this.pos.add(this.vel.x * segundos, this.vel.y * segundos);
    this.edad += dtMs;
  }

  alfa() {
    return 255 * Math.max(0, 1 - this.edad / DURACION_DISPARO_MS);
  }

  display() {
    noStroke();
    fill(255, 210, 0, this.alfa());
    circle(this.pos.x, this.pos.y, this.radio * 2);
  }

  estaMuerto() {
    return this.edad >= DURACION_DISPARO_MS;
  }

  estaFuera() {
    return (
      this.pos.x < -this.radio ||
      this.pos.x > width + this.radio ||
      this.pos.y < -this.radio ||
      this.pos.y > height + this.radio
    );
  }
}
