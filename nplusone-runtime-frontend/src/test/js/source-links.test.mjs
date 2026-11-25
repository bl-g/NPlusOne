import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSourceSettings, sourceLocation, sourceUrl, importToolboxUrl} from '../../main/resources/static/source-links-model.js';

const frame = 'at com.example.service.Orders$Loader.load(Orders.java:42)';
const config = normalizeSourceSettings({project:'My application',mappings:[
    {prefix:'com.example',root:'src/main/java'},
    {prefix:'com.example.service',root:'orders/src/main/java'}
]});

test('uses the longest matching prefix and the captured outer source filename', () => {
    const url = new URL(sourceUrl(frame,config));
    assert.equal(url.protocol,'jetbrains:');
    assert.equal(url.searchParams.get('project'),'My application');
    assert.equal(url.searchParams.get('path'),'orders/src/main/java/com/example/service/Orders.java:41:0');
    assert.equal(sourceUrl('com.examples.Orders.load(Orders.java:1)',config),null);
});

test('supports exact class mappings, module prefixes, hidden JVM classes and default packages', () => {
    const settings = normalizeSourceSettings({project:'Demo',mappings:[
        {prefix:'',root:'./src/main/java/'},
        {prefix:'com.example.OrdersTest',root:'src\\test\\java'}
    ]});
    assert.match(decodeURIComponent(sourceUrl('app//com.example.OrdersTest.run(OrdersTest.java:12)',settings)),/src\/test\/java\/com\/example\/OrdersTest.java:11:0$/);
    assert.equal(sourceLocation('loader/module/com.example.Foo$$Lambda/0x123.run(Foo.java:9)').className,'com.example.Foo$$Lambda');
    assert.match(decodeURIComponent(sourceUrl('Main.main(Main.java:3)',settings)),/src\/main\/java\/Main.java:2:0$/);
});

test('converts JVM line numbers to zero-based Toolbox coordinates only in the URL', () => {
    for(const line of [1,11,610]) {
        const frame=`com.example.Orders.load(Orders.java:${line})`;
        assert.equal(sourceLocation(frame).line,line);
        assert.equal(new URL(sourceUrl(frame,config)).searchParams.get('path'),
            `src/main/java/com/example/Orders.java:${line-1}:0`);
    }
});

test('does not link missing locations, malformed frames, or nonpositive lines', () => {
    for(const text of ['', '... 4 more frames ...','Foo.run(Unknown Source)','Foo.run(Native Method)',
        'Foo.run(Foo.java:0)','Foo.run(Foo.java:9007199254740992)','Foo.run(../Foo.java:2)',
        'com.example...Foo.run(Foo.java:2)']) assert.equal(sourceUrl(text,config),null,text);
    assert.equal(sourceUrl(frame,null),null);
});

test('validates project-relative roots and disambiguates mappings', () => {
    for(const root of ['/src/main/java','C:/src/main/java','../src','src/../java','src//java','https://example.org']) {
        assert.throws(()=>normalizeSourceSettings({project:'Demo',mappings:[{prefix:'',root}]}));
    }
    assert.throws(()=>normalizeSourceSettings({project:' ',mappings:[]}));
    assert.throws(()=>normalizeSourceSettings({project:'Demo',mappings:[]}));
    assert.throws(()=>normalizeSourceSettings({project:'Demo',mappings:[{prefix:'a',root:'src'},{prefix:'a',root:'test'}]}));
});

test('imports encoded Toolbox URLs and infers conventional multi-module source roots', () => {
    const result=importToolboxUrl('jetbrains://idea/navigate/reference?project=My%20app&path=orders%2Fsrc%2Fmain%2Fjava%2Fcom%2Fexample%2FOrders.java%3A42%3A1');
    assert.deepEqual(result,{project:'My app',mapping:{root:'orders/src/main/java',prefix:'com.example'}});
    assert.deepEqual(importToolboxUrl('jetbrains://idea/navigate/reference?project=Demo&path=custom/Foo.java:2').mapping,null);
    for(const text of ['javascript:alert(1)','https://example.org','jetbrains://idea/navigate/reference?project=Demo']) assert.throws(()=>importToolboxUrl(text));
});

test('imports IntelliJ class and method references without guessing their module', () => {
    const url='jetbrains://idea/navigate/reference?project=nplusone-detector&fqn=example.petclinic.ClinicQueryService';
    assert.deepEqual(importToolboxUrl(url),{project:'nplusone-detector',mapping:{prefix:'example.petclinic',root:''}});
    assert.deepEqual(importToolboxUrl(url+'%24Inner%23load()').mapping,{prefix:'example.petclinic',root:''});
    assert.throws(()=>importToolboxUrl(url.replace('example.petclinic.ClinicQueryService','<invalid>')));
});
