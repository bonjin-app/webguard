package dev.webguard;

import java.io.IOException;
import java.util.Set;
import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/** Example-only policy: integrate explicitly with an application's existing CSP. */
public class WebGuardFilter implements Filter {
    private static final Set<String> PUBLIC_PATHS = Set.of(
            "", "/", "/index.jsp", "/api/status", "/assets/app.js", "/assets/webguard.global.js");

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        var input = (HttpServletRequest) request;
        var output = (HttpServletResponse) response;
        output.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; require-trusted-types-for 'script'; trusted-types 'none'");
        output.setHeader("X-Content-Type-Options", "nosniff");
        output.setHeader("X-Frame-Options", "DENY");
        output.setHeader("Referrer-Policy", "no-referrer");
        // Post-build asset filenames are stable in this example; avoid stale immutable caches.
        output.setHeader("Cache-Control", "no-store");
        if (!PUBLIC_PATHS.contains(input.getServletPath())) {
            output.setStatus(404);
            output.setContentType("text/plain;charset=UTF-8");
            output.getWriter().write("Not found");
            return;
        }
        chain.doFilter(request, response);
    }
}
