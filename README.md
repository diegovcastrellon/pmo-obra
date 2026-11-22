# PMO Desk

App personal de gestión de proyectos de obra (PWA) para celular y PC. Funciona sin internet y guarda los datos en el dispositivo.

## Módulos
- **Agenda**: agenda diaria por hora armada automáticamente por puntaje PMO (prioridad + urgencia por fecha compromiso + ruta crítica), respetando juntas y comida.
- **Prioridades (Top)**: tareas vencidas, de la semana y de alta prioridad, con su puntaje explicado.
- **Proyectos (Obras)**: bitácora diaria (avance %, estatus, problemas, siguientes pasos), minutas con grabadora y transcripción por voz (acuerdos → tareas), tareas y compromisos.
- **Calendario**: vista mensual; exporta compromisos a `.ics` (Outlook, Google, Apple).
- **Cronograma (Gantt)**: importa el XML de MS Project (Archivo › Guardar como › XML), edita nombre/fechas/% y agrega actividades, y exporta XML para abrirlo en Project.
- **Finanzas**: OPEX/CAPEX por proyecto contra presupuesto; importa/exporta Excel (.xlsx) y descarga una plantilla.
- **Ajustes**: jornada laboral, respaldo/restauración JSON (para pasar datos entre celular y PC).

## Ejecutar en la PC
```bash
python3 -m http.server 5173 --directory ~/pmo-app
```
Abre http://localhost:5173 en Chrome o Edge y usa el ícono de “Instalar”.

## Usar en el celular
El micrófono y la instalación requieren HTTPS, así que hay que publicarla (GitHub Pages, Netlify o Cloudflare Pages, gratis) y abrir esa URL en el celular:
- iPhone: Safari › Compartir › “Agregar a inicio”.
- Android: Chrome › ⋮ › “Instalar app”.

## Notas
- Los datos viven en IndexedDB de cada navegador. Exporta respaldos con frecuencia.
- Al publicar una nueva versión, sube el número de `CACHE` en `sw.js`.
