# 🎁 Application Secret Santa & Nouvel An

Application web moderne, festive et sécurisée pour organiser des tirages au sort de Secret Santa entre amis, en famille ou entre collègues.

## ✨ Fonctionnalités

1. **Page de création & administration secrète** :
   - Définition du nom de l'événement, budget conseillé et consignes.
   - Ajout rapide des participants (nom par nom ou collage en bloc depuis WhatsApp / notes).
   - Règles d'exclusions personnalisées (ex: conjoints, frères & sœurs).
   - Tirage mathématiquement garanti sans auto-attribution (dérangement / cycle hamiltonien).
   - Tableau de bord administrateur secret avec suivi en temps réel des enveloppes ouvertes et option de réinitialisation si quelqu'un a cliqué par erreur.

2. **Lien unique partagé aux participants** :
   - Interface festive avec neige animée, effets glassmorphism et explosion de confettis.
   - Chaque invité clique sur son propre prénom.
   - **Protection ouverture unique** : une confirmation est demandée, puis l'enveloppe est immédiatement scellée côté serveur. Personne d'autre ne peut voir son résultat.
   - Sauvegarde sécurisée sur l'appareil de l'utilisateur pour qu'il puisse revoir son propre tirage sans bloquer les autres.

## 🚀 Démarrage rapide

```bash
# Lancer le serveur
npm start

# Mode développement avec rechargement automatique
npm run dev
```

Rendez-vous sur [http://localhost:3000](http://localhost:3000) pour créer votre premier tirage !
