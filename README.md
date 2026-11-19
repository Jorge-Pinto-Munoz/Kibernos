# Rekonoce · Kiber Champions

Web app mobile first para que el equipo se reconozca cada mes en los cuatro pilares de Kiber Champions: Colaboración, Responsabilidad, Respeto y Comunicación. Corre en **Google Apps Script** y guarda los datos en una **Hoja de cálculo de Google**.

## Cómo funciona un mes

| Etapa | Quién | Qué pasa |
|---|---|---|
| Abrir nominación | Admin | Elige el mes que se evalúa y la fecha límite. Aparece el contador en el inicio de todos. |
| Nominación | Equipo | Cada persona entra con su nombre, lee el aviso de anonimato y nomina a 1 persona por pilar con un motivo (mín. 40 caracteres). Puede omitir un pilar. Envía todo junto y ya no se puede cambiar. |
| Cerrar y anunciar finalistas | Admin | Pasan las 3 personas más nominadas por pilar (si hay empate en el 3er lugar, pasan todas las empatadas). Define la fecha límite de la votación final. |
| Finalistas | Equipo | Vota 1 finalista por pilar. Nadie puede votar por sí mismo. No se muestran los conteos. |
| Cerrar votación | Admin | Se calculan los ganadores y quedan guardados sin mostrarse. Si hay empate gana quien tuvo más votos en la nominación; si sigue el empate, el pin es compartido. |
| Mostrar ganadores | Admin | Todos ven la revelación animada (3-2-1, el pin cae, confeti) con los reconocimientos anónimos debajo. |
| Cerrar mes | Admin | El mes pasa al Salón de Champions y se puede abrir el siguiente. |

**Panel de administrador** (PIN `5591`): etapa actual, contador, cuántos votaron, lista de quién falta (con botón para copiar los nombres) y cuántos votos recibió cada persona.

**Anonimato.** La app guarda *quién participó* y *por quién se votó* en pestañas separadas. Las papeletas no llevan nombre ni hora y se insertan en filas al azar. Por eso el panel muestra quién falta y cuántos votos recibió cada persona, pero no puede mostrar quién votó por quién.

## Instalar en Google (15 minutos)

1. En Google Drive crea una Hoja de cálculo nueva, por ejemplo `Rekonoce · datos`.
2. En la hoja: **Extensiones → Apps Script**.
3. En el editor crea estos archivos y pega el contenido de la carpeta `apps-script/`:
   - Secuencia de comandos (`+` → Secuencia de comandos): `Code`, `Logic`
   - HTML (`+` → HTML): `Index`, `Styles`, `App`, `Pins`
   - En **Configuración del proyecto** activa "Mostrar el archivo de manifiesto appsscript.json" y reemplázalo por `apps-script/appsscript.json`.
4. Elige la función `setup` en la barra superior y presiona **Ejecutar**. Autoriza los permisos. Esto crea las pestañas, carga al equipo y guarda el PIN.
5. **Implementar → Nueva implementación → Aplicación web**.
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario** (o "Cualquier usuario de Kibernum" si el equipo usa cuentas de Google de la empresa).
6. Copia la URL que termina en `/exec` y compártela con el equipo. En el teléfono: abrir en el navegador → **Agregar a pantalla de inicio**.

Alternativa con terminal: `npx @google/clasp login`, luego `npx @google/clasp create --type sheets --title "Rekonoce" --rootDir apps-script` y `npx @google/clasp push`. Después sigue desde el paso 4.

**Al cambiar el código:** Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión. La URL se mantiene.

## Ajustes del día a día

- **Equipo:** pestaña `Personas`. La columna `activo` en `FALSE` deja a la persona fuera de votar y de ser nominada (hoy Noelia Barrera, por postnatal; votan 19 de 20 personas). Para sumar a alguien agrega una fila con un `id` único.
- **Cambiar el PIN:** Configuración del proyecto → Propiedades del script → `ADMIN_PIN`.
- **Seguridad del PIN:** se valida en el servidor, nunca viaja al teléfono. Tras 5 intentos fallidos se bloquea 10 minutos. La sesión de admin dura 6 horas.

## Límites conocidos

- **El ingreso es por nombre, sin contraseña.** Alguien con la URL podría votar con el nombre de otra persona. Si pasa, la persona real verá "Ya enviaste tus nominaciones" y podrá avisar. Si Kibernum usa Google Workspace, se puede cambiar a ingreso con la cuenta de Google.
- **La dueña o dueño de la Hoja puede abrir los datos.** Las papeletas no tienen nombre, pero el historial de versiones de Google Sheets registra la hora de cada cambio y se podría cruzar con la pestaña `Participacion`. No compartas la hoja.

## Calidad (QA)

Todo se prueba sin Google: `qa/build-harness.js` arma la app real con un servidor simulado que ejecuta el mismo `Logic.gs`.

```bash
npm install && npx playwright install chromium
npm run qa
```

- `npm test`: 9 pruebas de lógica (PIN y bloqueo, plazos, autovoto, motivos, finalistas con empate, desempate y pin compartido, anonimato, orden de etapas).
- `npm run qa:ui`: revisa 45 pantallas y estados en 5 anchos (320, 360, 390, 430 y 1280 px). Busca elementos que se salen de su contenedor o del teléfono, pines fuera de su círculo, solapes, texto recortado, imágenes rotas, botones de menos de 44 px, contraste bajo AA y errores de consola. Deja capturas en `qa/screens/` y el informe en `qa/REPORT.md`.
- `npm run qa:e2e`: recorrido completo a clics, del ingreso a la revelación y el cierre del mes.

`docs/mockup/index.html` es la demo navegable generada por el mismo script (datos de ejemplo, se reinicia al recargar).
