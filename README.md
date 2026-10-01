# SalcoHunt!

Juego de realidad aumentada para el celular. Los jugadores tendrán 30 segundos era atrapar a la mayor cantidad de Salcotines; los cuales aparecen a su alrededor y se esconden rápidamente. Hay que girar el celular y tocar todos los que se puedan encontrar alrededor.

Funciona directo en el navegador, sin instalar ninguna app, y no depende de motores ni servicios externos: todo el código, las imágenes y la librería 3D viven en este repositorio y se publican con GitHub Pages.

## Cómo se juega

1. **Inicio.** La pantalla explica las reglas. Al tocar **Comenzar**, el navegador pide permiso para usar la cámara y, en iPhone, también el movimiento del teléfono.
2. **Cuenta regresiva.** 3, 2, 1, ¡Ya!
3. **La caza.** Durante 30 segundos aparecen Salcotines a tu alrededor. Cada uno se queda solo un momento, balanceándose, y luego se esconde hundiéndose. Al principio duran más; a medida que pasa el tiempo aparecen más seguido y duran menos.
   - Hay que **girar el celular** para buscarlos. Las **flechas fucsia** en el borde de la pantalla indican dónde hay Salcotines que no estás viendo.
   - Al **tocar** uno, sale girando con confeti y aparece un "+1".
   - **Combo:** cada 3 atrapados seguidos (sin que se escape ninguno) aparece "¡Combo!" y suma un punto extra.
   - En los últimos 5 segundos el reloj se pone rojo.
4. **Resultado.** Se muestra cuántos atrapaste y tu récord, que queda guardado en ese celular. Con **15 o más** aparece la imagen del premio y el mensaje para canjearlo; si no, dice cuántos faltaron. El botón **Jugar otra vez** reinicia sin volver a pedir permisos.

En computador se juega **arrastrando con el mouse** para mirar alrededor y haciendo clic sobre los Salcotines.

## Dificultad

La dificultad se calibró con jugadores simulados que giran a distinta velocidad, tardan distinto en reaccionar y no siempre tocan en el punto exacto. En partidas completas de 30 segundos sacaron:

| Jugador simulado | Puntajes |
| --- | --- |
| Lento | 12 a 19 |
| Promedio | 23 a 29 |
| Rápido | alrededor de 40 |

Con la meta en 15, el jugador promedio gana y al más lento le queda justo al borde, lo que invita a volver a jugar. Los jugadores simulados tienen puntería perfecta, así que una persona real probablemente saque algo menos. Conviene probarlo con gente y ajustar `GOAL` o `LIFETIME_MS` según lo que se vea.

## Cómo funciona por dentro

| Parte | Qué hace |
| --- | --- |
| Cámara (`getUserMedia`) | Muestra la cámara trasera de fondo, a pantalla completa. |
| Sensores (`DeviceOrientation`) | Leen el giro del celular y mueven la cámara 3D en la misma dirección, para que los Salcotines queden "fijos" a tu alrededor. |
| three.js (`lib/three.min.js`) | Dibuja a los Salcotines y el confeti. Es la versión r128, con licencia MIT, guardada en el propio repositorio. |

El rastreo es **de rotación**: los Salcotines se mantienen en su lugar cuando la persona gira, pero no se acercan si camina. Para este juego no hace falta más, y a cambio funciona igual en iPhone y en Android.

## Estructura del repositorio

```
index.html          Pantallas (inicio, carga, resultado, error), marcador, flechas y textos
css/style.css       Estilos: fondo, marcador, flechas, combos, resultado
js/main.js          Toda la lógica del juego
lib/three.min.js    Librería 3D (three.js r128)
assets/
  fondo.png         Imagen de fondo (degradado)
  intro.png         Cartel de la pantalla de inicio
  1.png             Salcotín
  2.png             Premio
  amarillo.png      Confeti amarillo
  celeste.png       Confeti celeste
  rosa.png          Confeti rosa
.nojekyll           Le indica a GitHub Pages que publique los archivos tal cual
```

## Cómo personalizarlo

Casi todo se ajusta al inicio de `js/main.js`, sin tocar el resto del código.

**Ajustes de `CONFIG`:**

| Ajuste | Para qué sirve |
| --- | --- |
| `GAME_SECONDS` | Duración de la partida. |
| `GOAL` | Puntaje para ganar el premio. |
| `LIFETIME_MS` | Cuánto dura cada Salcotín antes de esconderse, al inicio y al final de la partida. **Es lo que más cambia la dificultad:** subirlo hace el juego más fácil. |
| `SPAWN_INTERVAL_MS` | Cada cuánto aparece uno nuevo, al inicio y al final. |
| `MAX_ACTIVE` | Máximo de Salcotines a la vez. |
| `IN_VIEW_CHANCE` | Probabilidad de que aparezca dentro de la pantalla (el resto obliga a girar). |
| `SPAWN_SPREAD_DEG` | Hasta qué ángulo a cada lado pueden aparecer (165 = casi detrás de la persona). |
| `DISTANCE_RANGE` / `HEIGHT_RANGE` | A qué distancia y altura aparecen, en metros. |
| `PLANE_HEIGHT` | Tamaño de Salcotín. El ancho se calcula solo según la imagen. |
| `COMBO_EVERY` / `COMBO_BONUS` | Cada cuántos seguidos hay combo y cuántos puntos extra da. |
| `TAP_TOLERANCE_PX` | Distancia a la que un toque cerca de un Salcotín también cuenta. |
| `HURRY_SECONDS` | Desde qué segundo el reloj se pone rojo. |

**Varios niveles de premio.** En `PRIZES` se puede agregar un premio mayor antes del actual, por ejemplo:

```js
const PRIZES = [
  { minScore: 25, image: 'assets/3.png', message: '¡Premio mayor! Toma un pantallazo y canjéalo.' },
  { minScore: CONFIG.GOAL, image: 'assets/2.png', message: '¡Toma un pantallazo y canjea tu premio!' },
]
```

**Cambiar los textos.** Los textos del juego están en `TEXTS` (cuenta regresiva, combo, "¡Tiempo!", resultado). Las reglas de la pantalla de inicio están en `index.html`, y los números de segundos y meta se completan solos desde `CONFIG`.

**Cambiar imágenes.** Reemplaza `assets/1.png`, `assets/2.png` o `assets/fondo.png` por otras con el mismo nombre. Para que la barra del navegador combine con el fondo, cambia el color de `theme-color` en `index.html`.

## Publicar

1. Sube todos los archivos a un repositorio de GitHub.
2. En **Settings → Pages**, elige **Deploy from a branch**, con la rama `main` y la carpeta `/ (root)`.
3. Espera a que la pestaña **Actions** quede en verde (uno o dos minutos).
4. Abre el sitio en el celular. Si ves una versión anterior, ábrelo en una pestaña privada para evitar la caché.

## Requisitos para quien juega

- Abrir el link en **Safari** (iPhone) o **Chrome** (Android). Los navegadores internos de Instagram, WhatsApp u otras apps suelen bloquear la cámara.
- Aceptar los permisos de cámara y de movimiento.
- El sitio tiene que abrirse con `https://` (GitHub Pages ya lo hace).
- Jugar en un lugar donde se pueda girar con tranquilidad, sin obstáculos cerca.
