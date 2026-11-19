# ReKonoce · Kiber Champions

**App en producción:** https://script.google.com/macros/s/AKfycbyC7S7mgw4eP7b3xQ6NYlKgIgTepk7P1d0hi5cmLL4l67xj2tR6QCh5fUA55QUXjm6F/exec

Web app mobile first para que el equipo se reconozca cada mes en los cuatro pilares de Kiber Champions: Colaboración, Responsabilidad, Respeto y Comunicación. Corre en **Google Apps Script** y guarda los datos en una **Hoja de cálculo de Google**.

## Cómo funciona un mes

| Etapa | Quién | Qué pasa |
|---|---|---|
| Abrir votación | Admin | Elige el mes que se evalúa y programa la fecha y hora límite. Desde ese momento todos ven el contador. |
| Votación | Equipo | En «¿Quién eres?» se ve el contador, cuántos han votado de cuántos y un ✓ junto a quien ya votó. Cada persona elige su nombre, lee el aviso de anonimato y vota por 1 persona por pilar con un motivo (mín. 40 caracteres). Puede omitir un pilar. Envía todo junto y ya no se puede cambiar. |
| Cerrar votación | Admin | Gana quien tenga más votos en cada pilar. Si hay empate en el primer lugar, el pin es compartido. Los resultados quedan guardados sin mostrarse. |
| Mostrar ganadores | Admin | Todos ven la revelación animada (3-2-1, el pin cae, confeti) con los reconocimientos anónimos debajo. Cada ganador se puede tocar para leer lo que le escribieron, y «Ver a todos los reconocidos» muestra a cada persona que recibió votos con sus mensajes (nunca quién los escribió). |
| Cerrar mes | Admin | El mes pasa al Salón de Champions y se puede abrir la votación del siguiente. |

**Panel de administrador** (PIN `5591`): etapa actual, contador, cuántos votaron, lista de quién falta (con botón para copiar los nombres), cuántos votos recibió cada persona y quién va ganando. Puede cambiar la fecha límite mientras la votación está abierta.

**Anonimato.** La app guarda *quién participó* y *por quién se votó* en pestañas separadas. Las papeletas no llevan nombre ni hora y se insertan en filas al azar. Por eso la app muestra quién ya votó (✓) y cuántos votos recibió cada persona, pero no puede mostrar quién votó por quién.

## Cómo está armado

- **Netlify** publica la app: `dist/netlify/index.html` (un solo archivo con estilos, pines y fotos).
- **Google Apps Script** es el servidor de datos: `dist/apps-script/Code.gs`. Recibe los votos por HTTPS (`doPost`) y los guarda en una Hoja de cálculo de tu Drive.
- El link del servidor está en `apps-script/App.html` (`API_URL`). Si cambias de implementación, actualízalo y vuelve a generar `dist/` con `node scripts/build-dist.js`.

## Instalar

**Google (servidor de datos, una vez)**
1. En [script.google.com](https://script.google.com) abre el proyecto (o crea uno nuevo).
2. Deja un solo archivo, `Código.gs`, y pega `dist/apps-script/Code.gs`. Si existe un archivo `Index.html`, se puede borrar: ya no se usa.
3. Elige la función `setup` y presiona **Ejecutar**. Autoriza. Se crea la Hoja «ReKonoce · datos» en tu Drive con el equipo cargado y el PIN.
4. **Implementar → Nueva implementación → Aplicación web** (o, si ya existe, **Administrar implementaciones → lápiz → Nueva versión**). Ejecutar como **Yo**; acceso **Cualquier usuario**.
5. Abre el link `/exec`: debe mostrar `{"ok":true,"app":"ReKonoce","servidor":"activo"}`.

**Netlify (la app)**
1. Pon `dist/netlify/index.html` solo en una carpeta.
2. En Netlify: **Add new site → Deploy manually** y arrastra la carpeta (o, en un sitio existente, **Deploys** → arrastra la carpeta).
3. Comparte el link de Netlify con el equipo. Es el que aparece en la tarjeta «Link para el equipo» del panel.

**Al cambiar el código:** `node scripts/build-dist.js`, pega el nuevo `Code.gs` y publica una **Nueva versión** (la URL `/exec` no cambia), y vuelve a subir `index.html` a Netlify.

## Qué guarda cada pestaña

Las primeras columnas las usa la app (ids cortos como `rm`); las de la derecha son para leer la Hoja con nombres completos.

| Pestaña | Columnas para leer |
|---|---|
| `Participacion` | **votó (nombre)** y **fecha**: quién votó y cuándo |
| `Nominaciones` | **reconocido (nombre)**, **pilar (nombre)** y el motivo. Nunca guarda quién escribió cada voto |
| `Historial` | **ganadores**: «Colaboración: … · Responsabilidad: … · …» |

Si la Hoja se creó con una versión anterior, vuelve a ejecutar `setup`: agrega los encabezados nuevos y completa los nombres de las filas existentes.

## Ajustes del día a día

- **Equipo:** pestaña `Personas`. La columna `activo` en `FALSE` deja a la persona fuera de votar y de ser nominada (hoy Noelia Barrera y Sofía Calderón, por postnatal; votan 18 de 20 personas). Para sumar a alguien agrega una fila con un `id` único.
- **Cambiar el PIN:** Configuración del proyecto → Propiedades del script → `ADMIN_PIN`.
- **Seguridad del PIN:** se valida en el servidor, nunca viaja al teléfono. Tras 5 intentos fallidos se bloquea 10 minutos. La sesión de admin dura 6 horas.

## Límites conocidos

- **El ingreso es por nombre, sin contraseña.** Alguien con la URL podría votar con el nombre de otra persona. Si pasa, la persona real verá un ✓ junto a su nombre sin haber votado y podrá avisar. Si Kibernum usa Google Workspace, se puede cambiar a ingreso con la cuenta de Google.
- **La dueña o dueño de la Hoja puede abrir los datos.** Las papeletas no tienen nombre, pero el historial de versiones de Google Sheets registra la hora de cada cambio y se podría cruzar con la pestaña `Participacion`. No compartas la hoja.

## Calidad (QA)

Todo se prueba sin Google: `qa/build-harness.js` arma la app real con un servidor simulado que ejecuta el mismo `Logic.gs`.

```bash
npm install && npx playwright install chromium
npm run qa
```

- `npm test`: 3 pruebas del `Code.gs` real sobre una simulación de Google Sheets (pestañas, nombres completos, caché) y 9 pruebas de lógica (PIN y bloqueo, fecha límite y extensión, autovoto, motivos, ✓ de quién votó, ganador y pin compartido, anonimato, orden de etapas).
- `npm run qa:ui`: revisa 47 pantallas y estados en 5 anchos (320, 360, 390, 430 y 1280 px). Busca elementos que se salen de su contenedor o del teléfono, pines fuera de su círculo, solapes, texto recortado, imágenes rotas, botones de menos de 44 px, contraste bajo AA y errores de consola. Deja capturas en `qa/screens/` y el informe en `qa/REPORT.md`.
- `npm run qa:e2e`: recorrido completo a clics, del ingreso a la revelación y el cierre del mes.

- `npm run qa:netlify`: la app servida «desde Netlify» contra el `Code.gs` real y una Hoja simulada.

`docs/mockup/index.html` es la demo navegable generada por el mismo script (datos de ejemplo, se reinicia al recargar).

## Fotos del equipo

Las fotos están en `assets/avatars/<id>.jpg` (el `id` de la pestaña `Personas`). Para cambiar o sumar una, reemplaza el archivo y ejecuta `python3 scripts/build-avatars.py .`: regenera `apps-script/Avatars.html`; luego `node scripts/build-dist.js` y sube el nuevo `index.html` a Netlify. Quien no tenga foto aparece con sus iniciales.
