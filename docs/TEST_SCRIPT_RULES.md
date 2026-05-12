# 📋 Reglas para Scripts de Validación y Prueba

> **Obligatorio para cualquier script que cree datos en producción.**
> Incumplir estas reglas puede bloquear conductores reales.

---

## ❌ Incidente que originó estas reglas

**2026-05-09**: El script de validación post-fix del flujo conductor creó un usuario con
`phoneNormalized: "2801629626"` en producción. Un conductor real intentó registrarse con
ese número y recibió el error **"Este número de teléfono ya está registrado con otra cuenta"**.
El número tuvo que ser eliminado manualmente.

---

## 📐 Reglas Obligatorias

### 1. Prefijo de email obligatorio

Todo usuario de prueba debe usar uno de los siguientes prefijos:

```
test_<timestamp>@vamo.test
auditoria_<timestamp>@vamo.test
smoke_<timestamp>@vamo.test
```

**Nunca** usar dominios reales (`gmail.com`, `hotmail.com`, etc.).
El dominio **debe ser** `@vamo.test` — no existe en producción y nunca puede colisionar con un usuario real.

### 2. Teléfono ficticio único por ejecución

```js
// ✅ CORRECTO: ficticio, único por timestamp, formato imposible para un real
const testPhone = `00000${Date.now().toString().slice(-7)}`;
// Ejemplo: "000001234567" — nunca puede ser un teléfono real argentino

// ❌ INCORRECTO: número real, repetible, puede colisionar
const testPhone = '2801629626';
```

**Regla**: El teléfono de prueba debe comenzar con `0000` (prefijo inválido en Argentina).

### 3. Marcadores obligatorios en Firestore

Todo documento de usuario creado por un script debe incluir:

```js
{
  isTestUser: true,
  createdByScript: true,
  testRunId: `test_${Date.now()}`,   // Identificador único por ejecución
  testScriptName: 'nombre_del_script.cjs',
  // ... resto del documento
}
```

Esto permite identificar y limpiar usuarios de prueba con una query simple:
```js
db.collection('users').where('isTestUser', '==', true).get()
```

### 4. Auto-limpieza obligatoria al finalizar

Todo script **debe limpiar** al terminar, tanto en éxito como en error:

```js
async function cleanup(uid, email, phone) {
  const errors = [];
  try { await db.collection('users').doc(uid).delete(); }
  catch (e) { errors.push(`Firestore /users/${uid}: ${e.message}`); }

  try { await db.collection('wallets').doc(uid).delete(); }
  catch (e) { errors.push(`Firestore /wallets/${uid}: ${e.message}`); }

  try { await auth.deleteUser(uid); }
  catch (e) { errors.push(`Auth ${uid}: ${e.message}`); }

  if (errors.length > 0) {
    // Regla 5: si falla, reportar para limpieza manual
    console.error('⚠️  CLEANUP INCOMPLETO — LIMPIAR MANUALMENTE:');
    console.error(`   UID:    ${uid}`);
    console.error(`   Email:  ${email}`);
    console.error(`   Phone:  ${phone}`);
    errors.forEach(e => console.error(`   Error: ${e}`));
  } else {
    console.log(`✅ Cleanup completo para ${uid}`);
  }
}
```

### 5. Reporte de limpieza fallida

Si el cleanup falla por cualquier razón, el script **debe imprimir claramente**:

```
⚠️  CLEANUP INCOMPLETO — LIMPIAR MANUALMENTE:
   UID:    abc123def456
   Email:  test_1234567890@vamo.test
   Phone:  000001234567
   Error:  [detalle del error]
```

### 6. Teléfonos prohibidos en scripts

- ❌ Números personales del equipo
- ❌ Números de conductores reales conocidos
- ❌ Números que comiencen con `280`, `297`, `299` (códigos de área Patagonia)
- ❌ Cualquier número de 10 dígitos sin prefijo `0000`

---

## 🔧 Template Base para Scripts de Validación

Usar siempre `scratch/lib/testUtils.cjs` (ver abajo) como base.

```js
const { createTestDriver, cleanupTestUser } = require('./lib/testUtils.cjs');

async function runTest() {
  const { uid, email, phone } = await createTestDriver({ scriptName: 'mi_test.cjs' });

  try {
    // ... lógica del test ...
    console.log('✅ Test passed');
  } finally {
    // Siempre limpiar, pase lo que pase
    await cleanupTestUser(uid, email, phone);
  }
}

runTest().catch(console.error);
```

---

## 📁 Ubicación de Scripts

```
vamo.vamo/
└── scratch/
    ├── lib/
    │   └── testUtils.cjs      ← Utilidades compartidas (ver reglas)
    ├── test_driver_postfix.cjs
    └── [otros scripts de test]
```

**Regla**: Los scripts de prueba van **exclusivamente** en `/scratch/`. Nunca en `src/`, `functions/` ni raíz.

---

## 📅 Historial de Cumplimiento

| Fecha | Script | Incidente | Resolución |
|---|---|---|---|
| 2026-05-09 | `test_driver_postfix.cjs` | Teléfono `2801629626` quedó en producción | Eliminado manualmente. Script actualizado. |
