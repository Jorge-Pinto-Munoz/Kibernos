# ReKonoce · Kiber Champions

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

## Instalar en Google (15 minutos)

1. En Google Drive crea una Hoja de cálculo nueva, por ejemplo `ReKonoce · datos`.
2. En la hoja: **Extensiones → Apps Script**.
3. **Forma rápida:** pega `dist/Code.gs` en el archivo `Code.gs` del editor, crea un archivo HTML llamado `Index` y pega `dist/Index.html`. Después reemplaza el manifiesto (ver abajo). Para regenerar `dist/` tras un cambio: `node scripts/build-dist.js`.

   **Forma por partes:** en el editor crea estos archivos y pega el contenido de la carpeta `apps-script/`:
   - Secuencia de comandos (`+` → Secuencia de comandos): `Code`, `Logic`
   - HTML (`+` → HTML): `Index`, `Styles`, `App`, `Pins`, `Avatars`
   - En **Configuración del proyecto** activa "Mostrar el archivo de manifiesto appsscript.json" y reemplázalo por `apps-script/appsscript.json`.
4. Elige la función `setup` en la barra superior y presiona **Ejecutar**. Autoriza los permisos. Esto crea las pestañas, carga al equipo y guarda el PIN.
5. **Implementar → Nueva implementación → Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario** (o "Cualquier usuario de Kibernum" si el equipo usa cuentas de Google de la empresa).
6. Copia la URL que termina en `/exec` y compártela con el equipo. En el teléfono: abrir en el navegador → **Agregar a pantalla de inicio**.

Alternativa con terminal: `npx @google/clasp login`, luego `npx @google/clasp create --type sheets --title "ReKonoce" --rootDir apps-script` y `npx @google/clasp push`. Después sigue desde el paso 4.

**Al cambiar el código:** Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión. La URL se mantiene.

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

- `npm test`: 9 pruebas de lógica (PIN y bloqueo, fecha límite y extensión, autovoto, motivos, ✓ de quién votó, ganador y pin compartido, anonimato, orden de etapas).
- `npm run qa:ui`: revisa 47 pantallas y estados en 5 anchos (320, 360, 390, 430 y 1280 px). Busca elementos que se salen de su contenedor o del teléfono, pines fuera de su círculo, solapes, texto recortado, imágenes rotas, botones de menos de 44 px, contraste bajo AA y errores de consola. Deja capturas en `qa/screens/` y el informe en `qa/REPORT.md`.
- `npm run qa:e2e`: recorrido completo a clics, del ingreso a la revelación y el cierre del mes.

`docs/mockup/index.html` es la demo navegable generada por el mismo script (datos de ejemplo, se reinicia al recargar).

## Fotos del equipo

Las fotos están en `assets/avatars/<id>.jpg` (el `id` de la pestaña `Personas`). Para cambiar o sumar una, reemplaza el archivo y ejecuta `python3 scripts/build-avatars.py .`: regenera `apps-script/Avatars.html`, que luego se pega en el editor de Apps Script. Quien no tenga foto aparece con sus iniciales.
