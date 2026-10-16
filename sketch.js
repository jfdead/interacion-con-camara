// ------------------------------------------------------------
// Especificaciones implementadas (ver SPEC.md):
// - Cámara en pantalla completa con p5.js
// - Blur al mover la mano de lado a lado (proporcional a velocidad X)
// - Sonido de limpieza de vidrios sincronizado con el movimiento
// - Gestos con ml5.js Handpose (21 landmarks):
//   * Meñique + índice alzados => cuernos en la cabeza
//   * Índice + pulgar (seña pistola) => bala en dirección del índice + sonido de disparo
//   * Si apunta muy cerca de la cámara => efecto vidrio rompiendo + sonido de vidrio
// - Todas las librerías por CDN. Sonidos desde URLs remotas (sin carpeta assets/)
// ------------------------------------------------------------

let video;
let handpose;
let hands = [];

// Sonidos (cargados desde URLs remotas en preload)
let sonidos = {};
let audioIniciado = false;
let btnIniciar;

// Estado del blur por movimiento lateral
let prevHandX = 0;
let blurAmount = 0;
let handX = 0;

// Efectos dinámicos
let balas = [];
let vidrios = [];

// URLs remotas de los sonidos (reemplazar con URLs reales alojadas en la nube)
const SONIDOS_URLS = {
  limpieza: 'https://example.com/sounds/limpieza-vidrios.mp3',
  disparo: 'https://example.com/sounds/disparo-bala.mp3',
  vidrio: 'https://example.com/sounds/vidrio-rompiendo.mp3'
};

function preload() {
  // p5.sound carga los archivos de audio desde la nube (CDN / URLs remotas)
  sonidos.limpieza = loadSound(SONIDOS_URLS.limpieza);
  sonidos.disparo = loadSound(SONIDOS_URLS.disparo);
  sonidos.vidrio = loadSound(SONIDOS_URLS.vidrio);
}

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Cámara a pantalla completa
  video = createCapture(VIDEO);
  video.size(windowWidth, windowHeight);
  video.hide();

  // ml5 Handpose sobre el video
  handpose = ml5.handpose(video, modeloListo);

  // Botón de inicio: desbloquea el contexto de audio del navegador
  btnIniciar = createButton('Iniciar cámara y audio');
  btnIniciar.position(20, 20);
  btnIniciar.mousePressed(iniciarAudio);

  textSize(16);
  textAlign(LEFT, TOP);
  textFont('monospace');
}

function modeloListo() {
  console.log('Modelo Handpose listo');
  handpose.on('predict', gotHands);
}

function gotHands(results) {
  hands = results;
}

function iniciarAudio() {
  if (!audioIniciado) {
    userStartAudio();
    audioIniciado = true;
    btnIniciar.hide();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  video.size(windowWidth, windowHeight);
}

function draw() {
  background(0);

  // Dibujar cámara con blur condicional (sobre el video únicamente)
  push();
  if (blurAmount > 0.5) {
    filter(BLUR, blurAmount);
  }
  image(video, 0, 0, width, height);
  pop();

  // Procesar gestos si hay mano detectada
  if (hands.length > 0) {
    procesarGestos(hands[0]);
  }

  // Actualizar y dibujar balas
  for (let i = balas.length - 1; i >= 0; i--) {
    balas[i].update();
    balas[i].display();
    if (balas[i].estaFuera() || balas[i].vida <= 0) {
      balas.splice(i, 1);
    }
  }

  // Actualizar y dibujar partículas de vidrio rompiéndose
  for (let i = vidrios.length - 1; i >= 0; i--) {
    vidrios[i].update();
    vidrios[i].display();
    if (vidrios[i].vida <= 0) {
      vidrios.splice(i, 1);
    }
  }

  // Disipar blur progresivamente cuando la mano se detiene
  blurAmount = lerp(blurAmount, 0, 0.05);

  // Información en pantalla
  fill(255);
  noStroke();
  text('Gestos: índice+meñique = cuernos  |  índice+pulgar = disparo', 20, 20);
}

/**
 * Analiza los landmarks de Handpose y ejecuta los gestos correspondientes.
 */
function procesarGestos(mano) {
  let landmarks = mano.landmarks;
  if (!landmarks || landmarks.length < 21) return;

  // Escalar coordenadas del video al tamaño del canvas
  let escalaX = width / video.width;
  let escalaY = height / video.height;

  // Posición de la muñeca (landmark 0) como referencia de la mano
  let manoX = landmarks[0].x * escalaX;
  let manoY = landmarks[0].y * escalaY;
  handX = manoX;

  // --- Blur y sonido de limpieza por movimiento lateral (eje X) ---
  let velX = abs(manoX - prevHandX);
  if (velX > 2) {
    blurAmount = map(velX, 2, 100, 2, 15);
    blurAmount = constrain(blurAmount, 0, 15);

    // Reproducir sonido de limpieza mientras la mano se mueve
    if (audioIniciado && !sonidos.limpieza.isPlaying()) {
      sonidos.limpieza.play();
    }
  } else {
    // Detener limpieza cuando la mano deja de moverse
    if (audioIniciado && sonidos.limpieza.isPlaying()) {
      sonidos.limpieza.stop();
    }
  }
  prevHandX = manoX;

  // Helper: dedo alzado si su punta está más arriba (menor y) que su base
  function dedoArriba(iPunta, iBase) {
    return landmarks[iPunta].y < landmarks[iBase].y;
  }

  let indiceArriba = dedoArriba(8, 5);   // punta 8, base 5
  let meñiqueArriba = dedoArriba(20, 17); // punta 20, base 17
  let pulgarArriba = dedoArriba(4, 2);   // punta 4, base 2 (aprox.)
  let medioArriba = dedoArriba(12, 9);
  let anularArriba = dedoArriba(16, 13);

  // ------------------------------------------------------------
  // Gesto 1: Cuernos (meñique + índice alzados, resto cerrados)
  // ------------------------------------------------------------
  if (indiceArriba && meñiqueArriba && !pulgarArriba && !medioArriba && !anularArriba) {
    dibujarCuernos(manoX, manoY);
  }

  // ------------------------------------------------------------
  // Gesto 2: Disparo (índice + pulgar, resto cerrados)
  // ------------------------------------------------------------
  if (indiceArriba && pulgarArriba && !medioArriba && !anularArriba && !meñiqueArriba) {
    disparar(landmarks, escalaX, escalaY);
  }
}

/**
 * Dibuja cuernos sobre la posición estimada de la cabeza
 * (arriba de la mano detectada, como referencia visual).
 */
function dibujarCuernos(x, y) {
  let cuernoY = y - 140; // por encima de la mano, simulando cabeza

  fill(180, 40, 40);
  noStroke();

  // Cuerno izquierdo
  beginShape();
  vertex(x - 45, cuernoY);
  vertex(x - 75, cuernoY - 70);
  vertex(x - 15, cuernoY);
  endShape(CLOSE);

  // Cuerno derecho
  beginShape();
  vertex(x + 45, cuernoY);
  vertex(x + 75, cuernoY - 70);
  vertex(x + 15, cuernoY);
  endShape(CLOSE);

  // Bordes
  stroke(120, 20, 20);
  strokeWeight(2);
  line(x - 45, cuernoY, x - 75, cuernoY - 70);
  line(x + 45, cuernoY, x + 75, cuernoY - 70);
}

/**
 * Dispara una bala en la dirección del índice.
 * Si la mano está muy cerca de la cámara (profundidad Z baja),
 * genera efecto de vidrio rompiéndose.
 */
function disparar(landmarks, escalaX, escalaY) {
  // Origen en la articulación base del índice (landmark 5)
  let origenX = landmarks[5].x * escalaX;
  let origenY = landmarks[5].y * escalaY;

  // Dirección: de la base (5) hacia la punta (8) del índice
  let puntaX = landmarks[8].x * escalaX;
  let puntaY = landmarks[8].y * escalaY;
  let dir = createVector(puntaX - origenX, puntaY - origenY);

  // Detectar si apunta muy cerca de la cámara usando profundidad Z (landmark 0)
  let z = landmarks[0].z || 0;
  let cerca = abs(z) < 0.03; // umbral empírico (ajustar según iluminación/distancia)

  // Sonidos
  if (audioIniciado) {
    sonidos.disparo.play();
    if (cerca) {
      sonidos.vidrio.play();
    }
  }

  // Crear bala
  balas.push(new Bala(origenX, origenY, dir, cerca));

  // Efecto vidrio rompiéndose si apunta muy cerca
  if (cerca) {
    for (let i = 0; i < 30; i++) {
      vidrios.push(new ParticulaVidrio(origenX, origenY));
    }
  }
}

// ------------------------------------------------------------
// Clase Bala
// ------------------------------------------------------------
class Bala {
  constructor(x, y, dir, cerca) {
    this.pos = createVector(x, y);
    this.vel = dir.copy().normalize().mult(18);
    this.cerca = cerca;
    this.vida = 255;
    this.radio = 5;
  }

  update() {
    this.pos.add(this.vel);
    this.vida -= 4;
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());

    // Cuerpo de la bala
    fill(255, 210, 0, this.vida);
    noStroke();
    rectMode(CENTER);
    rect(0, 0, this.radio * 2, this.radio * 4);

    // Estela trasera
    fill(255, 120, 0, this.vida / 2);
    rect(0, this.radio * 2, this.radio, this.radio * 3);

    pop();
  }

  estaFuera() {
    return (
      this.pos.x < -50 ||
      this.pos.x > width + 50 ||
      this.pos.y < -50 ||
      this.pos.y > height + 50
    );
  }
}

// ------------------------------------------------------------
// Clase ParticulaVidrio (efecto de romper vidrio)
// ------------------------------------------------------------
class ParticulaVidrio {
  constructor(x, y) {
    this.pos = createVector(x, y);
    this.vel = p5.Vector.random2D().mult(random(2, 10));
    this.vida = 255;
    this.tam = random(3, 8);
  }

  update() {
    this.pos.add(this.vel);
    this.vel.mult(0.94); // fricción del aire
    this.vida -= 7;
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y);
    fill(180, 210, 255, this.vida);
    noStroke();
    rectMode(CENTER);
    rect(0, 0, this.tam, this.tam);
    pop();
  }
}
