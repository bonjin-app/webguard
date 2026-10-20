package dev.webguard;

import static org.junit.jupiter.api.Assertions.*;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Comparator;
import org.apache.catalina.Context;
import org.apache.catalina.startup.Tomcat;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Exercises the real JSP compiler, HTTP servlet and public assets on loopback. */
class ServletIntegrationTest {
    private static final Path WEBAPP = Path.of("src/main/webapp").toAbsolutePath();
    private static final HttpClient CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).build();
    private static Tomcat tomcat;
    private static Path temporaryBase;
    private static URI base;

    @BeforeAll
    static void startTomcat() throws Exception {
        temporaryBase = Files.createTempDirectory("webguard-tomcat-");
        tomcat = new Tomcat();
        tomcat.setBaseDir(temporaryBase.toString());
        tomcat.setHostname("127.0.0.1");
        tomcat.setPort(0);
        tomcat.getConnector().setProperty("address", "127.0.0.1");
        Context context = tomcat.addWebapp("/webguard", WEBAPP.toString());
        context.setParentClassLoader(ServletIntegrationTest.class.getClassLoader());
        // Explicit registration also works when build-tool class directories are not annotation-scanned.
        Tomcat.addServlet(context, "dev.webguard.StatusServlet", new StatusServlet());
        context.addServletMappingDecoded("/api/status", "dev.webguard.StatusServlet");
        tomcat.start();
        assertTrue(context.getState().isAvailable(), "Web application must start successfully");
        base = URI.create("http://127.0.0.1:" + tomcat.getConnector().getLocalPort() + "/webguard/");
    }

    @AfterAll
    static void stopTomcat() throws Exception {
        try {
            if (tomcat != null) {
                try { tomcat.stop(); } finally { tomcat.destroy(); }
            }
        } finally {
            if (temporaryBase != null) {
                try (var paths = Files.walk(temporaryBase)) {
                    for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
                }
            }
        }
    }

    private static HttpResponse<String> get(String path) throws Exception {
        return CLIENT.send(HttpRequest.newBuilder(base.resolve(path))
                .timeout(Duration.ofSeconds(30)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void jspRendersHtmlWithRestrictiveServerCsp() throws Exception {
        var response = get("");
        assertEquals(200, response.statusCode(), response.body());
        assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("text/html"));
        assertTrue(response.body().contains("<h1>JSP + Servlet example</h1>"));
        assertTrue(response.body().contains("src=\"assets/webguard.global.js\""));
        assertTrue(response.body().contains("src=\"assets/app.js\""));
        assertFalse(response.body().contains("<%@"), "JSP source must be compiled on the server");
        String csp = response.headers().firstValue("Content-Security-Policy").orElseThrow();
        assertTrue(csp.contains("default-src 'self'"));
        assertTrue(csp.contains("script-src 'self'"));
        assertTrue(csp.contains("connect-src 'self'"));
        assertTrue(csp.contains("object-src 'none'"));
        assertTrue(csp.contains("frame-ancestors 'none'"));
        assertTrue(csp.contains("form-action 'self'"));
        assertTrue(csp.contains("require-trusted-types-for 'script'"));
        assertTrue(csp.contains("trusted-types 'none'"));
        assertFalse(csp.contains("unsafe-inline"));
    }

    @Test
    void servletReturnsExpectedJsonWithoutCaching() throws Exception {
        var response = get("api/status");
        assertEquals(200, response.statusCode(), response.body());
        assertTrue(response.headers().firstValue("Content-Type").orElse("").startsWith("application/json"));
        assertEquals("no-store", response.headers().firstValue("Cache-Control").orElseThrow());
        assertEquals("{\"status\":\"ok\",\"answer\":42}", response.body());
    }

    @Test
    void protectedScriptsAreAvailableOverHttp() throws Exception {
        var app = get("assets/app.js");
        var sdk = get("assets/webguard.global.js");
        assertEquals(200, app.statusCode(), "Run node scripts/prepare-jsp.mjs before Maven tests");
        assertEquals(200, sdk.statusCode());
        assertTrue(app.headers().firstValue("Content-Type").orElse("").contains("javascript"));
        assertTrue(sdk.body().contains("WebGuardSDK"));
        assertNotEquals(Files.readString(Path.of("assets-src/app.js")), app.body());
        assertFalse(app.body().contains("sourceMappingURL"));
        assertFalse(sdk.body().contains("sourceMappingURL"));
    }

    @Test
    void originalSourcesAndSourceMapsAreNotPublic() throws Exception {
        assertEquals(404, get("assets/app.js.map").statusCode());
        assertEquals(404, get("assets/webguard.global.js.map").statusCode());
        assertEquals(404, get("assets-src/app.js").statusCode());
        assertEquals(404, get("src/main/java/dev/webguard/StatusServlet.java").statusCode());
        try (var files = Files.walk(WEBAPP)) {
            assertFalse(files.anyMatch(path -> path.toString().endsWith(".map")), "Public webapp must contain no source maps");
        }
    }
}
