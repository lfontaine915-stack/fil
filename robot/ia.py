"""Point d'entrée pour une future étape IA (tri ou résumé).

Aujourd'hui : ne fait rien. Pour brancher une IA plus tard, il suffit de
remplir les deux champs ci-dessous. L'appli les utilise déjà :
  - item["resume"]   : texte affiché à la place de l'extrait
  - item["score_ia"] : nombre entre -1 et 1, ajouté au score de classement

Cette fonction n'est appelée que sur les nouveaux éléments, pour limiter
le coût d'une éventuelle API.
"""


def enrichir(item):
    return item
