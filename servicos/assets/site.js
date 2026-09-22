document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());

// Navegacao interna: posiciona o inicio da secao logo abaixo do cabecalho sticky.
document.querySelectorAll('a[href^="#"]').forEach(link => {
  link.addEventListener('click', event => {
    const selector = link.getAttribute('href');
    if (!selector || selector === '#') return;
    const target = document.querySelector(selector);
    if (!target) return;
    event.preventDefault();
    const header = document.querySelector('.top');
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const top = target.getBoundingClientRect().top + window.scrollY - headerHeight;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    if (history.replaceState) history.replaceState(null, '', selector);
  });
});
