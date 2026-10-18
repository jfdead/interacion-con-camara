// ------------------------------------------------------------
// Especificaciones implementadas (ver SPEC.md):
// - Cámara en pantalla completa con p5.js
// - Gesto de pistola (índice + pulgar) detectado con ml5.js Handpose
// - Al detectar el gesto, aparece un círculo que viaja en la dirección del índice
// - Sin sonidos, sin cuernos, sin blur, sin otros efectos
// - Librerías por CDN (p5.js + ml5.js)
// ------------------------------------------------------------

let video;
let handpose;
let hands = [];

// Círculos disparados
let disparos = [];

// Overlay de depuración (no forma parte del SPEC; se activa con la tecla D)
let debug = false;

function setup() {
  createCanvas(windowWidth, windowHeight);

  // Cámara a pantalla completa
  video = createCapture(VIDEO);
  video.size(windowWidth, windowHeight);
  video.hide();

  // ml5 Handpose sobre el video
  handpose = ml5.handpose(video, modeloListo);

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

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if (video) {
    video.size(windowWidth, windowHeight);
  }
}

function keyPressed() {
  if (key === 'd' || key === 'D') debug = !debug;
}

/**
 * ml5 Handpose entrega los landmarks en coordenadas NORMALIZADAS [0..1]
 * y en formato array [x, y, z]. Se leen ahi y se escalan al canvas.
 */
function leerLandmark(landmarks, i) {
  const p = landmarks[i];
  // ml5 0.12.x => array [x, y, z]
  if (Array.isArray(p)) return { x: p[0], y: p[1], z: p[2] };
  // defensivo: algunas versionesDevuelven objetos
  return { x: p.x, y: p.y, z: p.z };
}

function draw() {
  background(0);

  // Dibujar cámara sin efectos
  image(video, 0, 0, width, height);

  // Procesar gestos si hay mano detectada
  if (hands.length > 0) {
    procesarGestos(hands[0]);
  }

  // Actualizar y dibujar los círculos disparados
  for (let i = disparos.length - 1; i >= 0; i--) {
    disparos[i].update();
    disparos[i].display();
    if (disparos[i].estaFuera() || disparos[i].vida <= 0) {
      disparos.splice(i, 1);
    }
  }

  // Overlay de depuración
  if (debug && hands.length > 0) {
    dibujarDebug(hands[0]);
  }

  // Información en pantalla
  fill(255);
  noStroke();
  text('Gesto: índice + pulgar = dispara círculo', 20, 20);
  text('Presioná D para ver la detección de dedos', 20, 40);
}

/**
 * Analiza los landmarks de Handpose y ejecuta el gesto de disparo.
 */
function procesarGestos(mano) {
  const landmarks = mano.landmarks;
  if (!landmarks || landmarks.length < 21) return;

  // Normalizado [0..1] => píxeles del canvas
  const norm = (i) => {
    const p = leerLandmark(landmarks, i);
    return { x: p.x * width, y: p.y * height, z: p.z };
  };

  // Helper: dedo alzado si su punta está más arriba (menor y) que su base
  const dedoArriba = (iPunta, iBase) => norm(iPunta).y < norm(iBase).y;

  const indiceArriba = dedoArriba(8, 5);   // punta 8, base 5
  const pulgarExtendido = dedoArriba(4, 3); // punta 4, articulación 3
  const medioArriba = dedoArriba(12, 9);
  const anularArriba = dedoArriba(16, 13);
  const meniqueArriba = dedoArriba(20, 17);

  // ------------------------------------------------------------
  // Gesto: Disparo (índice arriba + pulgar extendido, resto cerrados)
  // ------------------------------------------------------------
  if (indiceArriba && pulgarExtendido && !medioArriba && !anularArriba && !meniqueArriba) {
    // Un círculo nuevo cada 8 frames mientras se mantenga el gesto
    if (frameCount % 8 === 0) {
      const origen = norm(5); // base del índice
      const punta = norm(8);  // punta del índice
      const dir = createVector(punta.x - origen.x, punta.y - origen.y);
      disparos.push(new CirculoDisparo(origen.x, origen.y, dir));
    }
  }
}

/**
 * Dibuja landmarks y estado de dedos para depurar la detección.
 */
function dibujarDebug(mano) {
  const landmarks = mano.landmarks;
  const leer = (i) => {
    const p = leerLandmark(landmarks, i);
    return { x: p.x * width, y: p.y * height };
  };

  // Puntos de los landmarks
  for (let i = 0; i < landmarks.length; i++) {
    const p = leer(i);
    fill(0, 255, 0);
    noStroke();
    ellipse(p.x, p.y, 6, 6);
    fill(255);
    textSize(10);
    text(i, p.x + 8, p.y - 4);
  }

  // Estado de cada dedo
  const dedoArriba = (iPunta, iBase) => leer(iPunta).y < leer(iBase).y;
  const estado = (nombre, arriba) => {
    fill(arriba ? color(0, 255, 0) : color(255, 80, 80));
    textSize(14);
    text(nombre + ': ' + (arriba ? 'ARRIBA' : 'abajo'), 20, 60 + estado.offsetY);
  };
  estado.offsetY = 0;
  estado('Índice', dedoArriba(8, 5));
  estado.offsetY += 20;
  estado('Pulgar', dedoArriba(4, 3));
  estado.offsetY += 20;
  estado('Medio', dedoArriba(12, 9));
  estado.offsetY += 20;
  estado('Anular', dedoArriba(16, 13));
  estado.offsetY += 20;
  estado('Meñique', dedoArriba(20, 17));
}

// ------------------------------------------------------------
// Clase CirculoDisparo
// ------------------------------------------------------------
class CirculoDisparo {
  constructor(x, y, dir) {
    this.pos = createVector(x, y);
    this.vel = dir.copy().normalize().mult(12);
    this.vida = 255;
    this.radio = 15;
  }

  update() {
    this.pos.add(this.vel);
    this.vida -= 4;
  }

  display() {
    push();
    translate(this.pos.x, this.pos.y);

    // Círculo que se desvanece
    fill(255, 210, 0, this.vida);
    stroke(255, 120, 0, this.vida);
    strokeWeight(2);
    ellipse(0, 0, this.radio * 2, this.radio * 2);

    // Núcleo brillante
    fill(255, 255, 150, this.vida / 2);
    noStroke();
    ellipse(0, 0, this.radio, this.radio);

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
