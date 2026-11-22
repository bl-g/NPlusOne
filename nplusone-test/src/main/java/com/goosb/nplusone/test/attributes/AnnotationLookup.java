package com.goosb.nplusone.test.attributes;

import java.lang.annotation.Annotation;
import java.lang.reflect.AnnotatedElement;
import java.util.HashSet;
import java.util.Optional;
import java.util.Set;

/** Annotation lookup for JUnit 4 without introducing the JUnit Platform at runtime. */
public final class AnnotationLookup {
    private AnnotationLookup() {}

    public static <A extends Annotation> Optional<A> findAnnotation(
            AnnotatedElement element,
            Class<A> type) {
        return find(element, type, new HashSet<>());
    }

    private static <A extends Annotation> Optional<A> find(
            AnnotatedElement element,
            Class<A> type,
            Set<AnnotatedElement> visited) {
        if(!visited.add(element)) {
            return Optional.empty();
        }
        A direct = element.getAnnotation(type);
        if(direct != null) {
            return Optional.of(direct);
        }
        for(Annotation annotation : element.getAnnotations()) {
            Class<? extends Annotation> annotationType = annotation.annotationType();
            if(!annotationType.getName().startsWith("java.lang.annotation.")) {
                Optional<A> found = find(annotationType, type, visited);
                if(found.isPresent()) {
                    return found;
                }
            }
        }
        if(element instanceof Class<?> clazz) {
            for(Class<?> implemented : clazz.getInterfaces()) {
                Optional<A> found = find(implemented, type, visited);
                if(found.isPresent()) {
                    return found;
                }
            }
            if(clazz.getSuperclass() != null) {
                return find(clazz.getSuperclass(), type, visited);
            }
        }
        return Optional.empty();
    }
}