# Plan de Registro y Onboarding de Conductores (VamO)

## 1. Regla de Oro: Registro Cero-Papel
El conductor **NO** carga documentación legal durante su registro inicial en la aplicación. Todo trámite legal y revisión de documentos inicial se realiza **PRESENCIALMENTE** o a través de los canales oficiales de la municipalidad, quienes luego habilitan al conductor desde el sistema VamO Muni.

## 2. Flujo de Onboarding en la App
Durante el registro en la aplicación (`/driver/register` y el `DriverOnboardingWizard`), solo se solicitarán los datos básicos para crear el perfil digital:

1. **Datos Personales**: Nombre, DNI, Teléfono, Correo Electrónico, Ciudad, Foto de Perfil.
2. **Vehículo**: Marca, Modelo, Año, Patente, Color, Foto Frontal del Vehículo.
3. **Modalidad de Trabajo**: Particular (Express) o Taxi/Remis (Profesional).
4. **Legales**: Aceptación de términos y condiciones.

> **Nota**: El registro de un conductor queda en estado `pending_municipal_review` con `docsStatus: "municipal_review"` y `documentsManagedByMunicipality: true` hasta que la municipalidad accione sobre el perfil.

## 3. Flujo Documental y Renovaciones (Dashboard Conductor)
La gestión documental está centralizada en la municipalidad. El conductor solo actúa de forma reactiva ante solicitudes específicas.

* **Estado Normal**: El dashboard mostrará la sección de documentos bloqueada, indicando que la documentación es administrada por el municipio.
* **Observaciones y Vencimientos**: Si la municipalidad observa un documento o un documento está próximo a vencer, este se agregará a la lista `documentsRequested` del conductor.
* **Acción Reactiva**: Solo los documentos que figuren en `documentsRequested` (observados o vencidos) habilitarán el botón para que el conductor suba un nuevo archivo desde su perfil.
* **Bloqueo**: Queda totalmente prohibida la subida libre de documentos no solicitados. Si `documentsRequested` está vacío, el usuario verá el mensaje "Aún no se han solicitado documentos."

## 4. Estructura de Datos (Recomendación)
El perfil del conductor mantendrá los siguientes flags para asegurar esta arquitectura:

```json
{
  "docsStatus": "municipal_review",
  "documentsManagedByMunicipality": true,
  "requiresManualReview": true,
  "documentsRequested": ["licencia", "seguro"], // Solo se llena cuando hay observaciones
  "documentUploadAllowedOnlyIfObserved": true
}
```

## 5. Resumen de Estados en Pantalla
- **Sin observaciones**: "Documentación administrada por el municipio" o "Verificación Aprobada". No se permiten subidas libres.
- **Documentos solicitados**: "Documentación en revisión municipal" o "Documentos Solicitados". Se habilita el botón de carga exclusivamente para los identificadores observados.
