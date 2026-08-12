# Provisión de credenciales internas

La autenticación interna no genera usuarios, roles ni contraseñas por defecto. El alta de una
persona para el piloto exige primero crear el usuario y sus asignaciones de rol mediante el
procedimiento de datos aprobado. Recién entonces se le asigna una contraseña.

## Precondiciones

- La migración `20260810190000_internal_auth_sessions` fue aplicada.
- El usuario existe, está activo y sus roles y alcances fueron revisados.
- `AUTH_JWT_SECRET` está definido con al menos 32 bytes y no se registra ni versiona.
- En producción, `AUTH_COOKIE_SECURE=true`. Si hay proxy inverso, `AUTH_TRUST_PROXY_HOPS` indica
  exactamente cuántos proxies confiables hay delante de la API (cero si se conecta directo).
- La consola es de una persona autorizada; la contraseña no se guarda en historial, archivos ni
  variables de entorno persistentes.

## Comando de una sola operación

En una terminal interactiva, desde la raíz del repositorio:

```bash
read -r -s USPAYA_PASSWORD
printf '%s' "$USPAYA_PASSWORD" | pnpm --filter @uspaya/api bootstrap:auth-user -- --email persona@dominio.test
unset USPAYA_PASSWORD
```

El comando toma la contraseña por entrada estándar, exige al menos 12 caracteres, guarda sólo su
hash scrypt y no crea usuarios. También incrementa la versión de autenticación y revoca todas las
sesiones existentes del usuario. Por eso debe comunicarse a la persona que tendrá que volver a
iniciar sesión.

## Controles posteriores

1. Iniciar sesión con la cuenta provisionada y confirmar el rol efectivo en `/api/v1/actors/me`.
2. Confirmar que una sesión anterior ya no puede ejecutar una ruta protegida.
3. Registrar quién hizo la provisión, para qué rol y cuándo en la evidencia privada del piloto;
   nunca registrar la contraseña, el JWT ni el refresh token.

## Protección del inicio de sesión

Los intentos fallidos se limitan de forma persistente a diez por origen de red cada quince minutos.
La base sólo conserva un hash SHA-256 del origen, no la dirección IP en texto. El límite no bloquea
una cuenta en particular: evita que un tercero pueda impedirle entrar a una persona conocida.
En un despliegue detrás de proxy se debe configurar la procedencia de red confiable antes del piloto
para que `request.ip` sea el cliente real y no la IP del proxy. La API rechaza valores fuera de 0–3
para `AUTH_TRUST_PROXY_HOPS` al iniciar fuera de desarrollo/test.
