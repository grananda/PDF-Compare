# Requisitos — PDF-Compare (paquete npm)

> **Versión 2** · **Generado:** 2026-08-17 10:46 CEST
> Documento de Fase 1 (AIDD · paso 1.1). Generado por `aidd requirements`.
> Entrada: no existe `docs/cliente-requisitos.md` — requisitos derivados por ingeniería inversa del código (`lib/`, `scripts/`, `types/`), el `README.md`, `package.json` y el workflow de CI. Salida hacia: `docs/mapa-historias-usuario.md`.
> Alcance: **estado actual (as-is)**. Este catálogo formaliza lo que el paquete ya hace; toda evolución posterior entra como *change* de AISDD.
> Producto hermano: el núcleo de comparación vive en `Py-PDF-Compare` y tiene su propio catálogo (`docs/requisitos.md` de ese repositorio). Este documento **no repite** los requisitos del núcleo.
> Pendiente de aprobación humana.

## 1. Descripción del sistema y objetivos

**PDF-Compare (npm)** es un *wrapper* del paquete Python `py-pdf-compare` que lleva la comparación visual de documentos PDF al ecosistema Node.js. No implementa comparación: aprovisiona un entorno Python aislado, invoca la CLI del paquete Python como subproceso y traduce su resultado a una API JavaScript/TypeScript y a una CLI de Node.

Problema que resuelve: un consumidor de Node no debería tener que instalar Python, gestionar un entorno virtual ni conocer la CLI de `pdf_compare` para comparar dos PDF desde su aplicación o su pipeline. Un `npm install pdf-compare` debe bastar.

Objetivos medibles (derivados del comportamiento actual):

- **O-1** — Instalación de un solo paso: tras `npm install pdf-compare` el paquete queda operativo sin intervención manual, siempre que exista Python 3.12+ en el sistema.
- **O-2** — Aislamiento total: el paquete no instala nada en el Python del sistema; todas sus dependencias Python viven en un entorno virtual de su propiedad, dentro de `node_modules`.
- **O-3** — Coste de mantenimiento mínimo: el wrapper no duplica lógica de dominio. Toda la comparación (alineado de páginas, resaltado, render vectorial) es responsabilidad de `py-pdf-compare`.
- **O-4** — Cero dependencias npm de terceros: el paquete se apoya únicamente en la biblioteca estándar de Node.
- **O-5** — El producto es consumible por tres vías con el mismo núcleo: CLI de Node, API programática CommonJS y tipos TypeScript.

## 2. Usuarios y roles

El sistema **no tiene autenticación ni control de acceso**: es una librería local. Los "roles" son perfiles de uso, no permisos.

| Rol | Descripción | Interfaz | Permisos / responsabilidades |
|---|---|---|---|
| **Desarrollador integrador** | Programador que embebe la comparación en una aplicación Node o TypeScript | API (`require('pdf-compare')`) | Instala el paquete, invoca la API, gestiona el informe resultante (fichero o memoria) |
| **Usuario de CLI / automatización** | Persona o script que compara PDF desde terminal o desde un pipeline | CLI (`npx pdf-compare`) | Pasa rutas de entrada y salida, interpreta el código de salida del proceso |
| **Operador de CI / imágenes** | Responsable de un entorno donde se instala el paquete de forma desatendida | `npm install`, variables de entorno | Decide si el aprovisionamiento Python ocurre en instalación o se difiere, y garantiza la presencia de Python 3.12+ |
| **Mantenedor** | Responsable del repositorio y de las publicaciones | GitHub Actions, npm registry | Versiona en `package.json`, sincroniza con la versión de `py-pdf-compare` y dispara la publicación |

## 3. Requisitos funcionales

Prioridad orientativa: **A** (nuclear, define el producto), **M** (relevante), **B** (accesorio).

### 3.1 Aprovisionamiento del entorno Python

| ID | Requisito | Actor | Prio |
|---|---|---|---|
| RF-01 | Tras `npm install`, el paquete debe aprovisionar automáticamente su entorno Python: localizar un intérprete válido, crear el entorno virtual e instalar las dependencias | Todos | A |
| RF-02 | La detección del intérprete debe recorrer una lista de candidatos propia de cada plataforma y seleccionar el primero que cumpla la versión mínima (3.12), en lugar de asumir un nombre de ejecutable fijo | Todos | A |
| RF-03 | El entorno virtual debe crearse dentro del propio paquete instalado, de forma que sea propiedad del paquete y desaparezca al desinstalarlo | Todos | A |
| RF-04 | Las dependencias Python deben instalarse en ese entorno a partir de un fichero de requisitos versionado en el paquete, no de una lista embebida en código | Mantenedor | M |
| RF-05 | Si ya existe un entorno virtual válido, el aprovisionamiento debe reutilizarlo y no reinstalar nada | Todos | M |
| RF-06 | Debe existir una reinstalación forzada que elimine el entorno previo y lo recree desde cero | Desarrollador integrador | M |
| RF-07 | Debe poder omitirse el aprovisionamiento automático durante la instalación mediante una variable de entorno, para entornos desatendidos o de construcción de imágenes | Operador de CI | M |
| RF-08 | Un fallo del aprovisionamiento **no debe abortar la instalación npm**: el paquete queda instalado y el mensaje de error indica cómo completarlo manualmente | Todos | A |
| RF-09 | El aprovisionamiento debe poder ejecutarse a posteriori, tanto como ejecutable propio del paquete como mediante una opción de la CLI | Todos | A |
| RF-10 | El sistema debe poder consultar y reportar el estado del entorno (listo o no, y ruta del intérprete resuelto) tanto desde la CLI como desde la API | Todos | A |

### 3.2 Interfaz de línea de comandos (Node)

| ID | Requisito | Actor | Prio |
|---|---|---|---|
| RF-11 | La CLI debe aceptar la ruta del PDF original y del modificado como argumentos posicionales obligatorios | Usuario de CLI | A |
| RF-12 | La CLI debe permitir indicar la ruta del informe de salida mediante una opción, con un valor por defecto cuando se omite | Usuario de CLI | A |
| RF-13 | La CLI debe ofrecer ayuda de uso y consulta de versión del paquete | Usuario de CLI | B |
| RF-14 | La CLI debe validar que ambos ficheros de entrada existen **antes** de arrancar el subproceso Python, y terminar con error y mensaje explícito si alguno falta | Usuario de CLI | A |
| RF-15 | La CLI debe verificar que el entorno Python está listo antes de comparar y, si no lo está, abortar mostrando el estado y la acción correctora | Usuario de CLI | A |
| RF-16 | Al terminar, la CLI debe distinguir explícitamente el caso "no hay diferencias" del caso "informe generado", indicando en este último el número de páginas y la ruta del informe | Usuario de CLI | M |
| RF-17 | Ante cualquier fallo, la CLI debe informar del error y terminar con código de salida distinto de cero, para poder encadenarse en scripts | Usuario de CLI | A |

### 3.3 API programática (Node / TypeScript)

| ID | Requisito | Actor | Prio |
|---|---|---|---|
| RF-18 | La API debe exponer una comparación por rutas de fichero que resuelva las rutas a absolutas y cree el directorio de salida si no existe | Desarrollador integrador | A |
| RF-19 | La API debe exponer una comparación en memoria que acepte los dos documentos como datos binarios y devuelva el informe también como datos binarios, sin exigir al consumidor gestionar ficheros temporales | Desarrollador integrador | A |
| RF-20 | La comparación en memoria debe eliminar siempre sus ficheros temporales, incluso cuando la comparación falla | Desarrollador integrador | M |
| RF-21 | Cada invocación debe admitir opciones propias: tiempo máximo de ejecución, intérprete Python alternativo y directorio de trabajo | Desarrollador integrador | M |
| RF-22 | Vencido el tiempo máximo, el sistema debe terminar el subproceso Python — con terminación forzada si no responde — y rechazar la operación con un error de expiración | Desarrollador integrador | A |
| RF-23 | El resultado debe distinguir tres desenlaces: comparación con diferencias (informe y número de páginas), comparación sin diferencias (sin informe) y error (excepción con el código de salida y la salida completa del proceso) | Desarrollador integrador | A |
| RF-24 | El sistema debe informar del número de páginas del informe generado. Este dato es **best-effort**: si no puede obtenerse, la comparación sigue considerándose correcta | Desarrollador integrador | B |
| RF-25 | La API debe exponer la versión del paquete y el estado de dependencias como funciones consultables | Desarrollador integrador | B |
| RF-26 | Toda la superficie pública debe estar descrita en definiciones TypeScript distribuidas con el paquete | Desarrollador integrador | M |
| RF-32 | Antes de comparar, el sistema debe eliminar cualquier informe previo existente en la ruta de salida, de modo que la ausencia del fichero al terminar sea una señal fiable de "sin diferencias" | Desarrollador integrador | A |

### 3.4 Empaquetado y distribución npm

| ID | Requisito | Actor | Prio |
|---|---|---|---|
| RF-27 | El proyecto debe publicarse en el registro npm como paquete público, declarando dos ejecutables: la CLI de comparación y el aprovisionamiento del entorno | Mantenedor | A |
| RF-28 | El tarball publicado debe contener únicamente lo necesario en tiempo de ejecución: código de la librería, fichero de requisitos, script de instalación, tipos, README y licencia | Mantenedor | M |
| RF-29 | La publicación debe dispararse automáticamente al integrar en la rama principal una versión no publicada, y ser idempotente: una versión ya etiquetada no vuelve a publicarse | Mantenedor | M |
| RF-30 | La publicación debe incluir procedencia verificable (*provenance*) y asignar la etiqueta de distribución en función de la versión: preliberaciones fuera del canal estable | Mantenedor | M |
| RF-31 | El paquete debe declarar sus plataformas soportadas y su versión mínima de Node, para que npm rechace instalaciones incompatibles | Mantenedor | B |

## 4. Requisitos no funcionales

| ID | Requisito | Categoría | Verificación |
|---|---|---|---|
| NFR-01 | El paquete no debe instalar ni modificar nada en el Python del sistema; toda dependencia Python queda confinada en su entorno virtual | Aislamiento | Instalación en un sistema con Python limpio y comprobación de los paquetes globales |
| NFR-02 | El wrapper no debe tener dependencias npm de terceros en tiempo de ejecución: solo biblioteca estándar de Node | Cadena de suministro | `npm ls --prod` sobre una instalación limpia |
| NFR-03 | El paquete debe funcionar en Windows, macOS y Linux, resolviendo por plataforma las rutas del entorno virtual y la necesidad de intermediar un shell al lanzar el subproceso | Portabilidad | Instalación y comparación en las tres plataformas |
| NFR-04 | El paquete debe funcionar sobre la versión mínima de Node declarada | Compatibilidad | Instalación y ejecución sobre esa versión exacta |
| NFR-05 | El paquete debe funcionar sobre Python 3.12 o superior, y rechazar con mensaje explícito cualquier intérprete inferior | Compatibilidad | Ejecución del aprovisionamiento con un Python 3.11 en el PATH |
| NFR-06 | `npm install` nunca debe fallar por causa de este paquete: un aprovisionamiento fallido degrada, no rompe (ver RF-08) | Robustez de instalación | Instalación en una máquina sin Python |
| NFR-07 | Todo el procesamiento de documentos debe ser local: el paquete no envía los PDF ni su contenido a ningún servicio externo. El único tráfico de red es la descarga de dependencias durante la instalación | Privacidad / RGPD | Ausencia de tráfico de red durante una comparación |
| NFR-08 | Una comparación no debe dejar residuos: ni proceso Python huérfano tras una expiración, ni ficheros temporales tras una comparación en memoria | Robustez | Comparaciones encadenadas y comparaciones interrumpidas por timeout |
| NFR-09 | La salida completa del subproceso Python (estándar y de error) debe propagarse íntegra al llamante, tanto en éxito como en error | Diagnosticabilidad | Provocar un fallo en el núcleo Python y verificar el mensaje recibido |
| NFR-10 | El wrapper no debe reimplementar lógica de comparación. Toda decisión de dominio (alineado, resaltado, render) permanece en `py-pdf-compare` | Mantenibilidad | Revisión de código: ausencia de manipulación de PDF en `lib/` |
| NFR-11 | Los módulos deben mantenerse desacoplados en una única dirección: la CLI depende de la API, la API del puente Python y el puente del aprovisionamiento; nunca al revés | Mantenibilidad | Revisión de imports en `lib/` |
| NFR-12 | Las definiciones TypeScript deben describir exactamente la superficie pública real: ningún símbolo declarado sin implementación ni tipo divergente de lo devuelto | Fiabilidad del contrato | Compilación de un consumidor TypeScript en modo estricto contra la API real |
| NFR-13 | La publicación en npm debe realizarse desde CI, sin credenciales manuales ni publicación desde máquinas de desarrollo | Seguridad | Revisión del workflow de publicación |
| NFR-14 | El proceso de publicación debe ser idempotente: una versión ya publicada no vuelve a publicarse aunque se repita la ejecución | Fiabilidad | Reejecución del workflow sobre una versión existente |
| NFR-15 | Una terminación anómala del subproceso Python —código distinto de cero o muerte por señal— debe reportarse siempre como error, nunca como comparación correcta | Fiabilidad | Matar el subproceso durante una comparación y verificar que la operación falla |

## 5. Restricciones técnicas no negociables

| ID | Restricción | Motivo |
|---|---|---|
| RT-01 | La comparación se delega **íntegramente** en el paquete PyPI `py-pdf-compare`, invocado como módulo Python en un subproceso. El repositorio npm **no contiene código Python propio** | Decisión estructural adoptada al eliminar el código Python duplicado (commit `4b45068`); revertirla significa mantener dos implementaciones del mismo dominio |
| RT-02 | La versión del paquete npm está **acoplada 1:1** a la versión de `py-pdf-compare`, y el fichero de requisitos fija esa misma versión como mínimo. Ambas son hoy `2026.2.3` | Ver **D-02**: el wrapper no aporta funcionalidad propia versionable; una versión npm que no se corresponda con una versión del núcleo sería ruido para el consumidor |
| RT-03 | El versionado sigue un esquema **calendario** (`AAAA.M.P`), heredado del paquete Python, no semántico | Consecuencia directa de RT-02; condiciona cómo se comunican los cambios incompatibles |
| RT-04 | El entorno Python es un **entorno virtual propiedad del paquete**, creado con el módulo `venv` del intérprete detectado y ubicado dentro del paquete instalado (`node_modules/pdf-compare/.venv`) | Ver **D-03**: el aislamiento respecto al Python del sistema es el valor diferencial del wrapper frente a "instálate tú `py-pdf-compare`" |
| RT-05 | El contrato de invocación con el núcleo es **su CLI**, no su API Python: argumentos posicionales de entrada más opción de salida. Cualquier cambio en esa CLI rompe el wrapper sin aviso de tipos | Es la única superficie estable que ofrece un subproceso; a cambio, no hay verificación en tiempo de compilación |
| RT-06 | El criterio de "sin diferencias" se infiere de la **salida textual del subproceso** y de la ausencia del fichero de informe. La cadena esperada es literalmente la que imprime `pdf_compare.cli` y debe mantenerse sincronizada con ella | Consecuencia de RT-05: el núcleo no expone un canal estructurado de resultado (ver **P-04**) |
| RT-07 | El conteo de páginas del informe se obtiene ejecutando **PyMuPDF** dentro del entorno virtual, dependencia *transitiva* de `py-pdf-compare` que este paquete no declara | Ver **P-05**: funciona hoy porque el núcleo la arrastra; deja de funcionar si el núcleo cambia de motor PDF |
| RT-08 | La lista `files` de `package.json` gobierna el contenido del tarball; el `.npmignore` presente en el repositorio es **inerte** mientras `files` exista | Regla de npm, no elegible: mantener ambos induce a error (ver **P-08**) |
| RT-09 | La publicación se realiza desde GitHub Actions, etiquetando la versión publicada con un tag `npm-v<version>` que actúa como registro de idempotencia | El release automático depende de ese tag como única fuente de "ya publicado" |
| RT-10 | El paquete declara compatibilidad con las tres plataformas de escritorio y una versión mínima de Node en `package.json` | npm rechaza la instalación fuera de esas condiciones; ampliarlas exige verificarlas |
| RT-11 | La compatibilidad de licencias entre el código propio, `py-pdf-compare` y PyMuPDF (AGPL-3.0 o comercial) condiciona la distribución del paquete en npm | Ver **P-01**: hay una contradicción sin resolver |

## 6. Alcance

### Dentro de esta fase (as-is)

- Aprovisionamiento automático y reparable de un entorno Python aislado desde una instalación npm.
- Las tres interfaces existentes: CLI de Node, API CommonJS y definiciones TypeScript.
- Comparación por rutas de fichero y comparación en memoria.
- Empaquetado y publicación en el registro npm con procedencia y publicación automática desde CI.

### Fuera de esta fase

- **Toda la lógica de comparación.** Alineado de páginas, resaltado, render vectorial y limitaciones asociadas (PDF escaneados, diferencias no textuales) pertenecen a `py-pdf-compare` y se documentan en su propio catálogo. Este paquete hereda sus capacidades y sus límites sin poder alterarlos.
- **Exposición de la aplicación de escritorio** del paquete Python: el wrapper solo alcanza la CLI.
- **Exposición de opciones avanzadas del núcleo** (comparación textual en *unified diff*, parámetros heredados de render): la CLI Node solo traslada entrada, entrada y salida.
- Distribución de un binario Python empaquetado o de ruedas precompiladas que eviten la necesidad de Python en el sistema.
- Gestión del entorno mediante alternativas al `venv` estándar (`uv`, `pipx`, `conda`) o reutilización de un entorno preexistente del usuario.
- Publicación de una variante ESM o de un *build* para navegador: el paquete es CommonJS y solo Node.
- Comparación concurrente gestionada por el wrapper (pool de subprocesos, cola de trabajos): cada invocación arranca su propio proceso.
- Cualquier funcionalidad de servidor, red o multiusuario.
- Internacionalización: los mensajes de la CLI y de la instalación están en inglés y así permanecen.

## 7. Variables de entorno y configuración requerida

El paquete consume **una sola variable de entorno propia** en tiempo de ejecución. El resto de la configuración es por argumentos de CLI o por el objeto de opciones de la API.

| Elemento | Ámbito | Uso |
|---|---|---|
| `PDF_COMPARE_SKIP_SETUP` | Instalación | Con valor `1` o `true`, omite el aprovisionamiento automático durante `npm install` (RF-07). Debe completarse después con el ejecutable de setup |
| `python/requirements.txt` | Instalación | Única declaración de las dependencias Python instaladas en el entorno virtual (RF-04, RT-02) |
| `node_modules/pdf-compare/.venv` | Ejecución | Entorno virtual propiedad del paquete; ubicación del intérprete usado en cada invocación (RT-04) |
| Carpeta temporal del sistema | Ejecución | Directorio efímero de la comparación en memoria; se elimina siempre al terminar (RF-20) |
| `NPM_TOKEN` | CI/CD | Secreto de repositorio usado para autenticar la publicación en npm (ver **P-06**) |
| `GITHUB_TOKEN` | CI/CD | Creación del tag de versión publicada; lo provee la propia plataforma |
| OIDC de GitHub Actions (`id-token: write`) | CI/CD | Permiso declarado en el job de publicación para procedencia y *trusted publishing* (ver **P-06**) |

Sin secretos propios que gestionar en local.

## 8. Preguntas abiertas y pendientes

- **P-01 · [BLOQUEANTE] Contradicción de licencia.** El fichero `LICENSE` contiene la **GPL-3.0**, el `README.md` enlaza a "GPL-3.0" y `package.json` declara **MIT**. Además, la cadena de dependencias llega a PyMuPDF (AGPL-3.0 o licencia comercial), lo que condiciona bajo qué licencia puede distribuirse el paquete. Hay que decidir cuál es la licencia real y alinear los tres sitios. Es el **mismo bloqueo abierto en `Py-PDF-Compare` (P-01 de su catálogo)** y debe resolverse una sola vez para ambos repositorios. Afecta a RT-11 y a toda la distribución (RF-27).
- ~~**P-02 · [BLOQUEANTE] El script de post-instalación está roto.**~~ **Resuelto el 2026-08-17.** `scripts/postinstall.js` importaba de `lib/setup.js` los símbolos `checkPoppler` y `printPopplerInstructions`, ya eliminados, y leía `result.poppler.available`, propiedad que `setup()` no devuelve: **toda** instalación terminaba imprimiendo `❌ Setup failed: Cannot read properties of undefined (reading 'available')` aunque el entorno virtual se hubiera creado bien. Retirados los restos de la etapa Poppler; el post-install verificado de extremo a extremo termina con `✅ setup complete` y código de salida 0. RF-01 y RF-08 quedan cumplidos.
- **P-03 · La comprobación de dependencias no comprueba las dependencias.** `checkSetup()` (`lib/setup.js:251`) solo verifica que el ejecutable Python del entorno virtual existe y responde; **no comprueba que `py-pdf-compare` esté instalado**. Un entorno creado con una instalación de dependencias fallida se reporta como `ready`, y el fallo aparece más tarde, en la primera comparación. Además, los campos `python` y `venv` del estado devuelto son **el mismo valor**, por lo que la distinción que anuncian la API, los tipos y el `README.md` no existe. Decidir si la comprobación pasa a validar la importabilidad del módulo Python y si los tres campos se colapsan en uno.
- **P-04 · Detección de "sin diferencias" acoplada a un mensaje de texto.** La revisión del 2026-08-17 mostró que el problema era peor de lo que este documento describía: la cadena buscada (`'No visual differences found'`) **nunca aparecía** en la salida de `pdf_compare.cli` — que imprime `"No differences found. No report generated."`, mientras que la cadena buscada solo existe en la GUI del paquete Python —, así que la detección dependía en exclusiva de la ausencia del fichero. Se corrigió la cadena y se añadió RF-32 (borrado del informe previo), con lo que ambos criterios vuelven a ser fiables. **Sigue abierto** el problema de fondo: el acoplamiento a un mensaje en inglés (RT-06) es frágil ante cualquier reescritura o traducción en el núcleo. Decidir si se solicita a `py-pdf-compare` un canal estructurado — código de salida dedicado o salida JSON, lo que sería un *change* en el repositorio hermano — o si se asume la fragilidad y se cubre con tests.
- ~~**P-05 · Conteo de páginas por construcción de código Python en cadena.**~~ **Resuelto el 2026-08-17.** El *snippet* interpolaba la ruta de salida dentro de un literal `r"..."`, de modo que una ruta con comilla doble rompía el script y una ruta controlada por el llamante permitía inyectar Python. La ruta pasa ahora por `sys.argv` y el conteo vive en una función propia con tiempo máximo, terminación forzada y drenado de `stderr`. Verificado con una ruta que contiene `"` y `'`. Durante la corrección apareció un defecto adicional que nadie había detectado: `import fitz` emite en **stdout** un aviso de deprecación de PyMuPDF, por lo que el patrón numérico aplicado sobre la salida completa fallaba **siempre** y todo informe devolvía `pageCount: null` — RF-24 nunca se había cumplido en la práctica. Corregido importando `pymupdf` con respaldo a `fitz` y leyendo la última línea numérica. RT-07 sigue vigente: la dependencia en PyMuPDF continúa siendo transitiva y no declarada.
- **P-06 · Modelo de autenticación de la publicación sin cerrar.** El job de publicación declara `id-token: write` con el comentario "required for OIDC trusted publishing" pero autentica con el secreto `NPM_TOKEN`: conviven los dos modelos. Además, el job `verify-npm-token` se ejecuta en **cada push de cualquier rama**, no es dependencia de ningún otro job y consume el secreto sin condicionar nada. Decidir si se migra a *trusted publishing* puro (y se elimina el secreto, cumpliendo mejor NFR-13) o si se retira el permiso OIDC y el job de verificación.
- **P-07 · [BLOQUEANTE para la calidad] No hay verificación automática.** El repositorio no contiene ni un test. El script `npm test` invoca `sample-files/`, que **no se publican en el tarball** (RF-28), por lo que solo funciona desde el código fuente. El CI construye y publica sin ejecutar el paquete en ninguna plataforma, pese a que NFR-03 compromete tres. Ningún requisito de este catálogo está verificado de forma automatizada. **Sigue abierto y es ahora más urgente**: los cuatro defectos corregidos el 2026-08-17 (P-02, P-04, P-05 y el conteo de páginas) son exactamente lo que un único test de humo habría detectado —tres de ellos llevaban rotos desde la publicación en npm sin que nadie lo notara—, y las correcciones se validaron con comprobaciones manuales y desechables que no protegen de regresiones. Definir la suite mínima: instalación limpia, `--check`, los cuatro escenarios de `sample-files/`, informe previo obsoleto en la ruta de salida y comparación en memoria.
- **P-08 · Restos del histórico en el repositorio.** `.npmignore` es inerte (RT-08) y además excluye ficheros que ya no existen (`python/main.py`, `scripts/download_poppler.py`, `scripts/build_windows.py`); `uv.lock` permanece en la raíz aunque el código Python se trasladó al repositorio hermano. Decidir qué se elimina y qué se conserva por trazabilidad.
- **P-09 · Divergencia de tipos en la comparación en memoria.** La implementación escribe y devuelve `Buffer`, mientras que `types/index.d.ts` y el `README.md` declaran `Uint8Array`. Son compatibles en tiempo de ejecución (`Buffer` extiende `Uint8Array`), pero un consumidor TypeScript que espere `Uint8Array` no puede usar los métodos de `Buffer` que sí recibe. Incumple NFR-12. Decidir cuál de los dos es el contrato.
- **P-10 · La restricción de acoplamiento 1:1 no está garantizada técnicamente.** RT-02 fija el acoplamiento de versiones, pero `python/requirements.txt` declara `py-pdf-compare>=2026.2.3` **sin cota superior**: una instalación futura traerá la última versión publicada del núcleo, no la que corresponde a la versión npm instalada. Decidir si se fija la versión exacta, si se acota el rango, o si se relaja RT-02 a "compatible con".
- **P-11 · Límites operativos sin definir.** El tiempo máximo por defecto (2 minutos) está elegido por criterio, no por medida, y no hay criterio establecido de número máximo de páginas ni de tamaño de fichero. Desde el 2026-08-17 ese tiempo máximo se aplica también al subproceso de conteo de páginas, que antes podía quedar colgado indefinidamente; el valor en sí sigue sin medirse. Convendría cuantificarlo con documentos reales antes de comprometerlo como NFR.
- **P-12 · Concurrencia no especificada.** Nada impide invocar varias comparaciones en paralelo desde la API, y cada una arranca su propio proceso Python sin límite ni cola. No está definido cuántas invocaciones simultáneas soporta el paquete ni qué debería ocurrir al superarlas.

## 9. Decisiones tomadas en el paso 1.1

| # | Pregunta | Opciones | Decisión | Origen | Justificación |
|---|---|---|---|---|---|
| D-01 | ¿El documento cubre solo el estado actual o también la evolución prevista? | as-is / as-is + to-be | **Solo el estado actual (as-is)** | usuario | El repositorio es *brownfield* sin backlog definido; la línea base trazable permite que cada evolución entre después como *change* de AISDD. Coherente con la decisión equivalente en `Py-PDF-Compare` |
| D-02 | ¿Cómo se formaliza la relación de versiones con `py-pdf-compare`? | acoplamiento 1:1 / versionado independiente / dejarlo abierto | **Acoplamiento 1:1** (RT-02) | usuario | El wrapper no aporta funcionalidad propia versionable: publicar versiones npm desacopladas del núcleo sería ruido para el consumidor. Se registra en P-10 que el fichero de requisitos aún no lo garantiza |
| D-03 | ¿El entorno virtual autogestionado dentro de `node_modules` es una restricción no negociable? | restricción / decisión revisable | **Restricción técnica** (RT-04) | usuario | El aislamiento respecto al Python del sistema es el valor diferencial del paquete frente a pedir al usuario que instale `py-pdf-compare` por su cuenta |
| D-04 | ¿Se repiten aquí los requisitos de comparación del núcleo? | repetir / referenciar | **Referenciar, no repetir** | default | Duplicar el catálogo del repositorio hermano crearía dos fuentes de verdad divergentes para el mismo dominio. La sección 6 declara explícitamente esa frontera |
| D-05 | ¿Cómo se trata la ausencia de `docs/cliente-requisitos.md`? | bloquear / continuar por ingeniería inversa | **Continuar por ingeniería inversa** | default | El producto existe y está publicado en npm; el código y el `README.md` son la fuente de verdad más fiable. Se deja constancia de que no hubo brief formal de cliente |
| D-06 | ¿Se documentan roles con permisos? | sí / no aplica | **No aplica: perfiles de uso** | default | Es una librería local sin autenticación ni control de acceso que modelar |
| D-07 | ¿Qué se hace con los defectos detectados durante la ingeniería inversa (P-02, P-03, P-05, P-09)? | corregirlos ahora / formalizar el comportamiento correcto y registrarlos | **Formalizar el comportamiento correcto como requisito y registrar la desviación** | default | Este paso produce el catálogo, no el código. Los RF describen lo que el sistema **debe** hacer; la sección 8 recoge dónde la implementación actual no lo cumple, para que entren como *changes* priorizables. **Revisada por D-09** |
| D-08 | ¿Se resuelve la contradicción de licencia detectada? | resolver ahora / registrar como bloqueante | **Registrar como bloqueante** (P-01) | default | Es una decisión legal del propietario del proyecto, no derivable del código, y comparte causa raíz con el bloqueo homónimo del repositorio hermano |
| D-09 | ¿Se aplican los hallazgos de la revisión de código del 2026-08-17? | aplicarlos ahora / dejarlos como *changes* pendientes | **Aplicarlos ahora** | usuario | Corrige D-07 para los defectos de ejecución. La revisión confirmó que tres de ellos (P-02, P-04 y el conteo de páginas) estaban rotos **en la versión publicada en npm**, no eran riesgos teóricos: el post-install fallaba siempre, la detección de "sin diferencias" dependía de una cadena inexistente y `pageCount` era siempre `null`. Se añaden RF-32 y NFR-15 para formalizar el comportamiento corregido. D-07 sigue vigente para los defectos de contrato aún abiertos (P-03, P-09) |
