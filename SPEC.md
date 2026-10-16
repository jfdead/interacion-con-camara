# __Especificaciones del proyecto__

## 1. Visión general
Aplicación web que muestra la cámara del usuario en pantalla completa y aplica efectos visuales y de audio en tiempo real, controlados por gestos de mano detectados con ml5.js (Handpose) sobre p5.js.

## 2. Stack tecnológico
- **p5.js** — cargado desde CDN (no se descarga localmente)
- **p5.sound** — cargado desde CDN (reproducción de audio sincronizada con gestos)
- **ml5.js con Handpose** — cargado desde CDN (detección de 21 landmarks de mano en tiempo real)
- **HTML5 + CSS3** — cámara como fondo a pantalla completa, ajuste al redimensionar ventana

## 3. Estructura del proyecto
```
interacion-con-camara/
├── index.html
└── sketch.js
```
- `index.html` y `sketch.js` están en la misma carpeta raíz; no se crean subcarpetas.
- Los archivos de audio se cargan desde URLs remotas (CDN o almacenamiento en la nube); no se crean carpetas locales ni se descargan sonidos al repositorio.
- En `sketch.js` se definen las URLs directas de los 3 sonidos necesarios.

## 4. Requisitos funcionales

### 4.1 Cámara en pantalla completa
- La entrada de la cámara ocupa el 100% del ancho y alto de la ventana.
- Se adapta automáticamente al redimensionar la ventana del navegador.
- Se solicita permiso de cámara al cargar la aplicación.

### 4.2 Efecto blur al mover la mano
- Al detectar movimiento de la mano de un lado al otro (eje X), se aplica un filtro de blur (`filter(BLUR)` de p5) sobre la imagen de la cámara.
- La intensidad del blur es proporcional a la velocidad del movimiento lateral.
- El blur se disipa progresivamente cuando la mano se detiene.

### 4.3 Sonido de limpieza de vidrios
- Se reproduce el sonido típico de limpiar vidrios mientras la mano se mueve de lado a lado, acompañando el efecto blur.
- El sonido se detiene o se atenúa cuando el movimiento cesa.

### 4.4 Gestos detectados con Handpose (21 landmarks)

#### 4.4.1 Cuernos (meñique + índice alzados)
- Cuando se detecten levantados simultáneamente el dedo meñique y el índice (resto de dedos cerrados), se superponen cuernos en la cabeza de la persona capturada por la cámara.
- Los cuernos pueden ser un dibujo procedural en p5 o una imagen superpuesta en la posición estimada de la cabeza.

#### 4.4.2 Disparo (seña de pistola: índice + pulgar)
- Al detectar el gesto de pistola (índice y pulgar extendidos en forma de L, otros dedos cerrados), se dispara una bala.
- La bala viaja en la dirección hacia la que apunta el dedo índice.
- Se reproduce el sonido de disparo de bala sincronizado con el lanzamiento.

#### 4.4.3 Efecto de vidrio rompiéndose (disparo cerca de la cámara)
- Si el dedo índice apunta en una dirección considerada "muy cerca de la cámara" (mano con profundidad Z baja / cerca del lente), el disparo genera un efecto visual de vidrio rompiéndose en ese punto.
- Se reproduce el sonido de vidrio rompiendo junto al disparo.

## 5. Requisitos técnicos y restricciones
- **CDN obligatorio**: p5.js, p5.sound y ml5.js se cargan desde CDN; no se descargan archivos locales de estas librerías.
- **Audio**: los navegadores bloquean la reproducción automática de sonido sin interacción previa del usuario. Se agregará un botón de inicio ("Iniciar cámara y audio") para desbloquear el contexto de audio de p5.sound.
- **Formatos de audio**: MP3 o WAV, cargados desde URLs remotas (no hay archivos locales de audio).
- **Detección**: Handpose requiere buena iluminación y la mano debe estar visible frente a la cámara.
- **Umbral de "cerca de la cámara"**: se definirá empíricamente según el valor de profundidad (Z) que devuelve Handpose para la mano.

## 6. Criterios de aceptación
- [ ] Cámara visible en pantalla completa al iniciar la aplicación.
- [ ] Blur visual aplicado al mover la mano de lado a lado.
- [ ] Sonido de limpieza de vidrios sincronizado con el movimiento lateral.
- [ ] Cuernos aparecen en la cabeza al hacer el gesto meñique + índice.
- [ ] Bala disparada en la dirección del índice al hacer la seña de pistola.
- [ ] Sonido de bala reproducido al disparar.
- [ ] Efecto de vidrio rompiéndose cuando el índice apunta muy cerca de la cámara.
- [ ] Sonido de vidrio rompiendo en ese caso.
- [ ] Todas las librerías cargan desde CDN; no hay descarga local de p5.js, p5.sound ni ml5.js.

## 7. Decisiones abiertas / pendientes
- Definir las URLs remotas de los 3 sonidos (limpieza, disparo, vidrio rompiendo) que se cargarán directamente en el sketch.
- Definir el umbral numérico de profundidad Z para considerar "cerca de la cámara".
- Definir si los cuernos son imagen externa o dibujo procedural en p5.