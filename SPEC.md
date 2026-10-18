# __Especificaciones del proyecto__

## 1. Visión general
Aplicación web que muestra la cámara del usuario en pantalla completa. Al detectar el gesto de pistola (índice y pulgar extendidos) con ml5.js Handpose sobre p5.js, se dibuja un círculo que viaja en la dirección hacia la que apunta el índice, simulando un disparo visual.

## 2. Stack tecnológico
- **p5.js** — cargado desde CDN (no se descarga localmente)
- **ml5.js con Handpose** — cargado desde CDN (detección de 21 landmarks de mano en tiempo real)
- **HTML5 + CSS3** — cámara como fondo a pantalla completa, ajuste al redimensionar ventana

## 3. Estructura del proyecto
```
interacion-con-camara/
├── index.html
└── sketch.js
```
- `index.html` y `sketch.js` están en la misma carpeta raíz; no se crean subcarpetas.
- No se usan archivos de audio ni sonidos.

## 4. Requisitos funcionales

### 4.1 Cámara en pantalla completa
- La entrada de la cámara ocupa el 100% del ancho y alto de la ventana.
- Se adapta automáticamente al redimensionar la ventana del navegador.
- Se solicita permiso de cámara al cargar la aplicación.

### 4.2 Gesto detectado con Handpose (21 landmarks)

#### 4.2.1 Disparo (seña de pistola: índice + pulgar)
- Al detectar el gesto de pistola (índice y pulgar extendidos en forma de L, otros dedos cerrados), se dibuja un círculo en la posición de la mano.
- El círculo viaja en la dirección hacia la que apunta el dedo índice.
- El círculo se desvanece progresivamente hasta desaparecer.
- No hay sonidos ni otros efectos especiales.

## 5. Requisitos técnicos y restricciones
- **CDN obligatorio**: p5.js y ml5.js se cargan desde CDN; no se descargan archivos locales de estas librerías.
- **Sin audio**: no se reproduce sonido alguno.
- **Detección**: Handpose requiere buena iluminación y la mano debe estar visible frente a la cámara.

## 6. Criterios de aceptación
- [ ] Cámara visible en pantalla completa al iniciar la aplicación.
- [ ] Al hacer el gesto de pistola (índice + pulgar), aparece un círculo que viaja en la dirección del índice.
- [ ] El círculo se desvanece y desaparece tras recorrer su trayecto.
- [ ] Todas las librerías cargan desde CDN; no hay descarga local de p5.js ni ml5.js.
- [ ] No hay sonidos ni efectos de audio.