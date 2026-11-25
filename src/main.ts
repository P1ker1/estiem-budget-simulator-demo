import './style.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (app) {
  const main = document.createElement('main');
  const heading = document.createElement('h1');
  heading.textContent = 'ESTIEM Budget Simulator';

  const subtitle = document.createElement('p');
  subtitle.textContent = 'Starter template ready.';

  main.append(heading, subtitle);
  app.append(main);
}
